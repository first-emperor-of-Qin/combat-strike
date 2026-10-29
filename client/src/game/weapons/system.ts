import * as THREE from 'three';
import { upgradeDamageMult, tierDps } from '@combat-strike/shared';
import type { WeaponDef, Element } from '@combat-strike/shared';
import type { Physics } from '../world/physics.js';
import type { Effects } from '../world/effects.js';
import type { AudioEngine } from '../core/audio.js';
import type { Input } from '../core/input.js';
import type { Player } from '../player/controller.js';
import type { Viewmodel } from './viewmodel.js';
import type { SkillSystem, CombatBridge } from './skills.js';
import type { EnemyLike, HudHooks } from '../types.js';
import type { RayHit } from '../world/physics.js';

/**
 * 武器系统：双槽位切换 / 散布与后坐 / 命中判定（衰减+爆头）/ 换弹 /
 * 投射物（追踪弹、火箭）与爆炸伤害 / 元素状态 / 被动特性 / 强化加成。
 * 所有敌人伤害经此结算。
 */

const DEG = Math.PI / 180;

interface Projectile {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  def: WeaponDef;
  mesh: THREE.Mesh;
  dmg: number;
  homing: boolean;
  target: EnemyLike | null;
}

const MAX_PROJECTILES = 60;

export class WeaponSystem implements CombatBridge {
  // 装备
  private slots: (WeaponDef | null)[] = [null, null];
  private slotIndex = 0;
  // 弹药
  private mag = new Array(2).fill(0);
  private reserve = new Array(2).fill(0);
  /** 强化等级 */
  private upgrades: Record<string, number> = {};

  private cooldown = 0;
  private reloadT = -1;
  private bloomAccum = 0;
  private switchT = 0;
  private triggerHeld = false;
  private semiLatch = false;

  // 强化弹（powerShot）
  private powerShots = 0;
  private powerMult = 1;
  // 聚能耦合（连续命中同一敌人）
  private streakEnemyId = -1;
  private streakCount = 0;

  // 技能系统（由 Game 注入）
  skills: SkillSystem | null = null;

  // 投射物池
  private projectiles: Projectile[] = [];

  // 统计
  kills = 0;
  shotsFired = 0;
  hitsCount = 0;
  damageDealt = 0;

  onAmmoChange?: () => void;

  constructor(
    private scene: THREE.Scene,
    private physics: Physics,
    private effects: Effects,
    private audio: AudioEngine,
    private input: Input,
    private player: Player,
    private viewmodel: Viewmodel,
    private hooks: HudHooks,
    private enemiesRef: () => EnemyLike[],
  ) {}

  // ----------------------------------------------------------
  // 装备与弹药
  // ----------------------------------------------------------
  equip(primary: WeaponDef, secondary: WeaponDef, upgrades: Record<string, number> = {}): void {
    this.slots = [primary, secondary];
    this.slotIndex = 0;
    this.upgrades = upgrades;
    for (let i = 0; i < 2; i++) {
      const d = this.slots[i]!;
      this.mag[i] = d.mag;
      this.reserve[i] = d.mag * d.reserveMags;
    }
    // 龙鳞守护被动
    this.player.damageTakenMult = primary.id === 'dragon-knight' || secondary.id === 'dragon-knight' ? 0.9 : 1;
    this.switchTo(0, true);
  }

  /** 强化弹状态（技能回调） */
  setPowerShots(shots: number, mult: number): void {
    this.powerShots = shots;
    this.powerMult = mult;
  }

  get current(): WeaponDef { return this.slots[this.slotIndex]!; }
  get currentId(): string { return this.current.id; }
  get magCount(): number { return this.mag[this.slotIndex]!; }
  get reserveCount(): number { return this.reserve[this.slotIndex]!; }
  get isReloading(): boolean { return this.reloadT >= 0; }

  private switchTo(index: number, instant = false): void {
    if (index === this.slotIndex && !instant) return;
    if (!this.slots[index]) return;
    this.slotIndex = index;
    this.reloadT = -1;
    this.switchT = instant ? 0 : 0.24;
    this.bloomAccum = 0;
    const def = this.current;
    this.viewmodel.setWeapon(def);
    this.skills?.setWeapon(def);
    this.pushAmmoHud();
  }

  private pushAmmoHud(): void {
    const def = this.current;
    const lvl = this.upgrades[def.id] ?? 0;
    this.hooks.setAmmo(this.mag[this.slotIndex]!, this.reserve[this.slotIndex]!, lvl > 0 ? `${def.name} +${lvl}` : def.name, this.isReloading);
  }

  // ----------------------------------------------------------
  // 伤害计算（衰减 / 爆头 / 强化 / 被动）
  // ----------------------------------------------------------
  private calcDamage(def: WeaponDef, dist: number, isHead: boolean, enemy: EnemyLike, perPellet = false): number {
    const t = THREE.MathUtils.clamp((dist - def.falloffStart) / (def.falloffEnd - def.falloffStart), 0, 1);
    let dmg = def.damage * (1 - t * (1 - def.falloffMin));
    if (isHead) dmg *= def.headshotMult;
    // 武器强化 +6%/级
    dmg *= upgradeDamageMult(this.upgrades[def.id] ?? 0);
    // 强化弹
    if (this.powerShots > 0 && !perPellet) dmg *= this.powerMult;
    // 被动
    if (def.id === 'golden-duel' && enemy.hp >= enemy.maxHp) dmg *= 1.3; // 致命磁能
    if (def.id === 'parasite' && enemy.hp < enemy.maxHp * 0.3) dmg *= 1.4; // 内脏暴击
    if (def.id === 'po-hong' && enemy.id === this.streakEnemyId) {
      dmg *= 1 + Math.min(0.25, this.streakCount * 0.05); // 聚能耦合
    }
    return Math.max(1, Math.round(dmg));
  }

  /** 命中元素状态（按武器被动） */
  private applyElementStatus(def: WeaponDef, enemy: EnemyLike, dmg: number): void {
    const status = (enemy as EnemyLike & { applyStatus?: (k: 'burn' | 'slow' | 'shock' | 'mark', d: number, p: number) => void }).applyStatus;
    if (!status) return;
    switch (def.id) {
      case 'judgement-flame':
      case 'dragon-knight':
        status.call(enemy, 'burn', 3, Math.max(2, dmg * 0.12));
        break;
      case 'yanmo-launcher':
        status.call(enemy, 'burn', 3, Math.max(4, dmg * 0.06));
        break;
      case 'white-night':
      case 'moon-bow':
        status.call(enemy, 'slow', 2, 0.65);
        break;
      case 'zeus-hand':
        status.call(enemy, 'shock', 0.8, 0);
        break;
      case 'dimension-star':
        status.call(enemy, 'mark', 4, 0);
        break;
      default:
        break;
    }
  }

  /** 命中回复类被动 */
  private lifestealPassive(def: WeaponDef, dmg: number, dist: number): void {
    if (def.id === 'shadow-asura' && dist < 6) this.player.heal(Math.max(1, Math.round(dmg * 0.08)));
    if (def.id === 'blood-shark' && this.skills && this.skills.overdriveT > 0) this.player.heal(Math.max(1, Math.round(dmg * 0.06)));
  }

  // ----------------------------------------------------------
  // 帧更新
  // ----------------------------------------------------------
  update(dt: number, enemyTargets: EnemyLike[]): void {
    this.cooldown -= dt;
    if (this.switchT > 0) this.switchT -= dt;
    const bloomDecayK = this.current.id === 'metal-storm' ? 9 : 6; // 稳定握把
    this.bloomAccum = Math.max(0, this.bloomAccum - dt * bloomDecayK);

    // 技能输入
    if (this.input.hit('KeyF') || this.input.buttonHit(1)) {
      this.skills?.tryCast();
    }

    // 换弹计时
    if (this.reloadT >= 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const def = this.current;
        const idx = this.slotIndex;
        const need = def.mag - this.mag[idx]!;
        const take = Math.min(need, this.reserve[idx]!);
        this.mag[idx]! += take;
        this.reserve[idx]! -= take;
        this.reloadT = -1;
        this.pushAmmoHud();
      }
    }

    // 输入：切换
    if (this.input.hit('Digit1')) this.switchTo(0);
    if (this.input.hit('Digit2')) this.switchTo(1);
    if (this.input.hit('KeyQ')) this.switchTo(1 - this.slotIndex);
    if (this.input.wheel !== 0 && Math.abs(this.input.wheel) > 30) this.switchTo(1 - this.slotIndex);

    // 开火
    const firing = this.input.mouseButtons[0];
    const def = this.current;
    const auto = def.rpm >= 160;
    if (firing && !auto) {
      if (!this.semiLatch) { this.tryFire(enemyTargets); this.semiLatch = true; }
    } else if (!firing) {
      this.semiLatch = false;
    }
    if (firing && auto) this.tryFire(enemyTargets);

    // ADS
    const ads = this.input.mouseButtons[2] && this.reloadT < 0 && this.switchT <= 0;
    this.viewmodel.setAds(!!ads);

    // 换弹键
    if (this.input.hit('KeyR') && this.reloadT < 0 && this.mag[this.slotIndex]! < def.mag && this.reserve[this.slotIndex]! > 0) {
      this.startReload();
    }

    // 空仓自动换弹
    if (this.mag[this.slotIndex] === 0 && this.reloadT < 0 && this.reserve[this.slotIndex]! > 0 && firing) {
      this.startReload();
    }

    // 投射物步进
    this.updateProjectiles(dt, enemyTargets);
  }

  private startReload(): void {
    const def = this.current;
    this.reloadT = def.reloadTime;
    this.viewmodel.playReload(def.reloadTime, (stage) => this.audio.reloadStage(stage));
    this.pushAmmoHud();
  }

  // ----------------------------------------------------------
  // 开火
  // ----------------------------------------------------------
  private tryFire(enemies: EnemyLike[]): void {
    if (this.cooldown > 0 || this.reloadT >= 0 || this.switchT > 0) return;
    const def = this.current;
    const idx = this.slotIndex;

    if (this.mag[idx]! <= 0) {
      this.audio.dryFire();
      this.cooldown = 0.18;
      return;
    }

    this.mag[idx]! -= 1;
    this.shotsFired++;
    // 狂暴射速
    const rpm = def.rpm * (this.skills?.rpmMult ?? 1);
    this.cooldown = 60 / rpm;
    this.pushAmmoHud();

    // 视听反馈
    this.audio.shoot(def.class);
    const recoilPower = THREE.MathUtils.clamp(def.recoilV / 2, 0.3, 2.2);
    this.viewmodel.triggerRecoil(recoilPower);
    this.player.applyRecoil(def.recoilV * DEG * 0.16, (Math.random() - 0.5) * def.recoilH * DEG * 0.12);
    this.player.addShake(def.recoilV * 0.012);

    // 散布（腰射/机瞄 + bloom）
    const ads = this.viewmodel.isAds();
    const bloomK = def.id === 'metal-storm' ? 0.7 : 1;
    const baseSpread = (ads ? def.adsSpread : def.hipSpread) + this.bloomAccum * bloomK;
    this.bloomAccum = Math.min(def.hipSpread * 1.6, this.bloomAccum + def.bloom);
    this.hooks.crosshairSpread(baseSpread);

    const camera = this.playerCamera;
    const origin = camera.position.clone();
    const muzzlePos = this.viewmodel.muzzleWorldPos(camera);

    // 多弹丸（霰弹）
    const pellets = def.pellets > 1 ? def.pellets : 1;
    for (let i = 0; i < pellets; i++) {
      const spreadDeg = baseSpread + (def.pellets > 1 ? def.pelletSpread : 0);
      const dir = coneDir(camera, spreadDeg);
      if (def.projectileSpeed > 0) {
        this.spawnProjectile(origin, dir, def, 1, muzzlePos, false);
      } else {
        this.hitscan(origin, dir, def, muzzlePos, enemies, i === 0);
      }
    }
  }

  private hitscan(origin: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef, muzzlePos: THREE.Vector3, enemies: EnemyLike[], showTracer: boolean): void {
    const maxDist = 150;
    const worldHit = this.physics.raycast(origin, dir, maxDist);
    let hitEnemy: EnemyLike | null = null;
    let hitHead = false;
    let hitPoint: THREE.Vector3 | null = null;

    let pierceLeft = def.pierce - 1;
    if (this.powerShots > 0) pierceLeft += 2; // 强化弹穿透
    const pierced = new Set<number>();

    let segOrigin = origin;
    let remaining = worldHit ? worldHit.dist : maxDist;
    let hitDist = worldHit ? worldHit.dist : maxDist;

    while (true) {
      let segBest: { enemy: EnemyLike; dist: number; isHead: boolean; point: THREE.Vector3 } | null = null;
      for (const e of enemies) {
        if (!e.alive || pierced.has(e.id)) continue;
        const h = e.hitTest(segOrigin, dir, remaining);
        if (h && (!segBest || h.dist < segBest.dist)) {
          segBest = { enemy: e, dist: h.dist, isHead: h.isHead, point: h.point };
        }
      }
      if (!segBest) break;
      pierced.add(segBest.enemy.id);

      const dist = segBest.dist;
      const dmg = this.calcDamage(def, dist, segBest.isHead, segBest.enemy);
      this.applyElementStatus(def, segBest.enemy, dmg);
      this.lifestealPassive(def, dmg, dist);
      this.effects.spark(segBest.point, dir.clone().negate(), segBest.isHead ? '#ffe08a' : hitSparkColor(def), 5, 3);
      const killed = segBest.enemy.applyDamage(dmg, segBest.isHead);
      this.hooks.damageNumber(segBest.point, dmg, segBest.isHead);
      this.hooks.hitmarker(segBest.isHead);
      this.audio.hit(segBest.isHead);
      this.damageDealt += dmg;
      this.hitsCount++;
      // 聚能耦合连击
      if (def.id === 'po-hong') {
        if (segBest.enemy.id === this.streakEnemyId) this.streakCount++;
        else { this.streakEnemyId = segBest.enemy.id; this.streakCount = 1; }
      }
      if (killed) {
        this.kills++;
        this.audio.killConfirm();
        this.onKillPassive(def, segBest.enemy);
      }

      if (pierceLeft <= 0) {
        hitEnemy = segBest.enemy; hitHead = segBest.isHead; hitPoint = segBest.point; hitDist = segBest.dist;
        break;
      }
      pierceLeft--;
      segOrigin = segBest.point.clone().addScaledVector(dir, 0.35);
      remaining -= segBest.dist + 0.35;
      if (remaining <= 0) break;
    }

    const endPoint = hitPoint
      ? hitPoint
      : worldHit ? worldHit.point : origin.clone().addScaledVector(dir, maxDist);

    if (showTracer) {
      const isPower = this.powerShots > 0;
      this.effects.tracer(muzzlePos, endPoint, def.accent, isPower ? 0.05 : def.class === 'sniper' ? 0.03 : 0.018);
      if (isPower) this.effects.tracer(muzzlePos, endPoint, '#ffffff', 0.015);
    }
    if (!hitEnemy && worldHit) {
      this.effects.spark(worldHit.point, worldHit.normal, '#c8cdd4', 6, 3.5);
    }
  }

  /** 击杀类被动 */
  private onKillPassive(def: WeaponDef, enemy: EnemyLike): void {
    switch (def.id) {
      case 'shadow-smg': // 掠影
        this.player.heal(3);
        break;
      case 'blood-shark': { // 猎杀本能
        const idx = this.slotIndex;
        this.reserve[idx] = Math.min(def.mag * def.reserveMags, this.reserve[idx]! + 3);
        this.pushAmmoHud();
        break;
      }
      case 'phantom': { // 电弧连锁
        const center = enemy.pos.clone().setY(enemy.height * 0.5);
        this.applyAreaSkillDamage(center, 3, Math.round(tierDps(def.tier) * 0.8), 'lightning');
        this.effects.explosion(center, 1.6, '#ffe95c');
        break;
      }
      case 'null-singularity': { // 虚数同调
        for (const e of this.enemiesRef()) {
          if (!e.alive || e.id === enemy.id) continue;
          const d = e.pos.distanceTo(enemy.pos);
          if (d < 5) {
            const pull = enemy.pos.clone().sub(e.pos).setY(0).normalize().multiplyScalar(Math.max(0, d - 1.4));
            e.pos.add(pull);
            (e as EnemyLike & { applyStatus?: (k: 'mark', d: number, p: number) => void }).applyStatus?.('mark', 4, 0);
            this.effects.spark(e.pos.clone().setY(e.height * 0.5), enemy.pos.clone().sub(e.pos).normalize(), '#b26bff', 2, 3);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  // ----------------------------------------------------------
  // CombatBridge：技能伤害桥
  // ----------------------------------------------------------
  applySkillDamage(enemy: EnemyLike, dmg: number, point: THREE.Vector3, headshot: boolean, element: Element): void {
    if (!enemy.alive) return;
    const killed = enemy.applyDamage(dmg, headshot);
    this.hooks.damageNumber(point, dmg, headshot);
    this.effects.spark(point, new THREE.Vector3(0, 1, 0), elementColor(element), 4, 2.5);
    this.damageDealt += dmg;
    if (killed) { this.kills++; this.audio.killConfirm(); }
  }

  applyAreaSkillDamage(center: THREE.Vector3, radius: number, dmg: number, element: Element, burnDps?: number): void {
    for (const e of this.enemiesRef()) {
      if (!e.alive) continue;
      const c = e.pos.clone(); c.y += e.height * 0.5;
      const d = c.distanceTo(center);
      if (d > radius) continue;
      const k = 1 - (d / radius) * 0.55;
      if (burnDps) {
        (e as EnemyLike & { applyStatus?: (k: 'burn', d: number, p: number) => void }).applyStatus?.('burn', 3, burnDps);
      }
      this.applySkillDamage(e, Math.max(1, Math.round(dmg * k)), c, false, element);
    }
  }

  nearestEnemies(origin: THREE.Vector3, maxCount: number, maxDist: number): EnemyLike[] {
    const list = this.enemiesRef()
      .filter((e) => e.alive && e.pos.distanceTo(origin) <= maxDist)
      .sort((a, b) => a.pos.distanceTo(origin) - b.pos.distanceTo(origin));
    return list.slice(0, maxCount);
  }

  spawnHomingProjectile(origin: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef, dmgMult: number, color: string): void {
    const p = this.allocProjectile(def, color);
    if (!p) return;
    // 追踪目标：初始方向最近者
    const enemies = this.enemiesRef().filter((e) => e.alive);
    let target: EnemyLike | null = null;
    let bestDot = 0.2;
    for (const e of enemies) {
      const to = e.pos.clone().setY(e.pos.y + e.height * 0.5).sub(origin).normalize();
      const dot = to.dot(dir);
      if (dot > bestDot) { bestDot = dot; target = e; }
    }
    if (!target && enemies.length > 0) {
      target = enemies.reduce((a, b) => a.pos.distanceTo(origin) < b.pos.distanceTo(origin) ? a : b);
    }
    p.alive = true;
    p.pos.copy(origin);
    p.vel.copy(dir).multiplyScalar(Math.max(def.projectileSpeed, 30));
    p.life = 5;
    p.dmg = Math.max(1, Math.round(def.damage * upgradeDamageMult(this.upgrades[def.id] ?? 0) * dmgMult));
    p.homing = true;
    p.target = target;
    p.mesh.visible = true;
    p.mesh.scale.setScalar(0.9);
  }

  raycastWorld(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
    return this.physics.raycast(origin, dir, maxDist);
  }

  // ----------------------------------------------------------
  // 投射物
  // ----------------------------------------------------------
  private allocProjectile(def: WeaponDef, color: string): Projectile | null {
    let p = this.projectiles.find((x) => !x.alive);
    if (!p) {
      if (this.projectiles.length >= MAX_PROJECTILES) return null;
      const geo = new THREE.SphereGeometry(0.09, 8, 6);
      const mat = new THREE.MeshBasicMaterial({ color: def.accent });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      p = { alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, def, mesh, dmg: 0, homing: false, target: null };
      this.projectiles.push(p);
    }
    (p.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    p.def = def;
    return p;
  }

  private spawnProjectile(origin: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef, dmgMult: number, muzzlePos: THREE.Vector3, homing: boolean): void {
    const p = this.allocProjectile(def, def.accent);
    if (!p) return;
    p.alive = true;
    // 从枪口出发（避免贴脸命中自己面前的掩体）
    p.pos.copy(muzzlePos);
    p.vel.copy(dir).multiplyScalar(def.projectileSpeed);
    p.life = 4;
    p.dmg = Math.max(1, Math.round(def.damage * dmgMult));
    p.homing = homing;
    p.target = null;
    p.mesh.visible = true;
    p.mesh.scale.setScalar(def.blastRadius > 0 ? 1.8 : 1);
  }

  private updateProjectiles(dt: number, enemies: EnemyLike[]): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; p.mesh.visible = false; continue; }

      // 追踪修正
      if (p.homing && p.target && p.target.alive) {
        const desired = p.target.pos.clone().setY(p.target.pos.y + p.target.height * 0.5).sub(p.pos).normalize().multiplyScalar(p.vel.length());
        p.vel.lerp(desired, Math.min(1, dt * 4.5));
      }

      const step = p.vel.clone().multiplyScalar(dt);
      const dist = step.length();
      const dir = step.clone().normalize();

      const worldHit = this.physics.raycast(p.pos, dir, dist);
      let hitEnemy: { e: EnemyLike; dist: number; isHead: boolean; point: THREE.Vector3 } | null = null;
      for (const e of enemies) {
        if (!e.alive) continue;
        const h = e.hitTest(p.pos, dir, dist);
        if (h && (!hitEnemy || h.dist < hitEnemy.dist)) {
          hitEnemy = { e, dist: h.dist, isHead: h.isHead, point: h.point };
        }
      }

      const enemyFirst = hitEnemy && (!worldHit || hitEnemy.dist <= worldHit.dist);
      if (enemyFirst || worldHit) {
        const impactPoint = enemyFirst ? hitEnemy!.point : worldHit!.point;
        this.explode(p, impactPoint, enemies, enemyFirst ? hitEnemy!.e : null, enemyFirst ? hitEnemy!.isHead : false);
        p.alive = false;
        p.mesh.visible = false;
        continue;
      }

      p.pos.add(step);
      p.mesh.position.copy(p.pos);
      // 弹道拖尾
      const trailColor = p.homing ? elementColor(p.def.element) : p.def.accent;
      this.effects.spark(p.pos, dir.clone().negate(), trailColor, 1, 0.4);
    }
  }

  private explode(p: Projectile, point: THREE.Vector3, enemies: EnemyLike[], directEnemy: EnemyLike | null, directHead: boolean): void {
    const def = p.def;
    if (def.blastRadius > 0) {
      this.effects.explosion(point, def.blastRadius, def.accent);
      this.audio.explosion();
      const baseDmg = Math.round(p.dmg * upgradeDamageMult(this.upgrades[def.id] ?? 0));
      for (const e of enemies) {
        if (!e.alive) continue;
        const center = e.pos.clone(); center.y += e.height * 0.5;
        const d = center.distanceTo(point);
        if (d > def.blastRadius) continue;
        const k = 1 - (d / def.blastRadius) * 0.55;
        const dmg = Math.max(1, Math.round(baseDmg * k));
        this.applyElementStatus(def, e, dmg);
        const killed = e.applyDamage(dmg, false);
        this.hooks.damageNumber(center, dmg, false);
        if (killed) { this.kills++; this.audio.killConfirm(); this.onKillPassive(def, e); }
        this.damageDealt += dmg;
      }
      if (directEnemy) {
        const dmg = Math.max(1, Math.round(baseDmg * 0.35 * (directHead ? 1.5 : 1)));
        const killed = directEnemy.applyDamage(dmg, directHead);
        if (killed) { this.kills++; this.audio.killConfirm(); this.onKillPassive(def, directEnemy); }
      }
      // 玩家自伤（火箭近距离）
      const pc = this.player.pos.clone(); pc.y += 1;
      const pd = pc.distanceTo(point);
      if (pd < def.blastRadius * 0.8) {
        this.player.damage(Math.round(baseDmg * 0.06 * (1 - pd / (def.blastRadius * 0.8))));
      }
    } else {
      const target = directEnemy;
      if (target) {
        const dmg = Math.max(1, Math.round(p.dmg * (directHead ? def.headshotMult : 1)));
        this.applyElementStatus(def, target, dmg);
        const killed = target.applyDamage(dmg, directHead);
        this.hooks.damageNumber(point, dmg, directHead);
        this.hooks.hitmarker(directHead);
        this.audio.hit(directHead);
        this.damageDealt += dmg;
        if (killed) { this.kills++; this.audio.killConfirm(); this.onKillPassive(def, target); }
        this.effects.spark(point, p.vel.clone().normalize().negate(), elementColor(def.element), 6, 3);
      } else {
        this.effects.spark(point, new THREE.Vector3(0, 1, 0), elementColor(def.element), 5, 3);
      }
    }
  }

  private playerCamera!: THREE.PerspectiveCamera;
  bindCamera(camera: THREE.PerspectiveCamera): void { this.playerCamera = camera; }
}

function coneDir(camera: THREE.Camera, spreadDeg: number): THREE.Vector3 {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  if (spreadDeg <= 0.001) return dir;
  const rad = spreadDeg * DEG;
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * rad;
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  return dir
    .addScaledVector(right, Math.cos(a) * Math.tan(r))
    .addScaledVector(up, Math.sin(a) * Math.tan(r))
    .normalize();
}

function elementColor(e: Element): string {
  switch (e) {
    case 'fire': return '#ff7a33';
    case 'ice': return '#6fd8ff';
    case 'lightning': return '#ffe95c';
    case 'void': return '#b26bff';
    case 'holy': return '#ffd75c';
    default: return '#ff9a7a';
  }
}

function hitSparkColor(def: WeaponDef): string {
  return elementColor(def.element) === '#c8cdd4' ? '#ff7a55' : elementColor(def.element);
}
