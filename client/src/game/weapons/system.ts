import * as THREE from 'three';
import type { WeaponDef } from '@combat-strike/shared';
import type { Physics } from '../world/physics.js';
import type { Effects } from '../world/effects.js';
import type { AudioEngine } from '../core/audio.js';
import type { Input } from '../core/input.js';
import type { Player } from '../player/controller.js';
import type { Viewmodel } from './viewmodel.js';
import type { EnemyLike, HudHooks } from '../types.js';

/**
 * 武器系统：双槽位切换 / 散布与后坐 / 命中判定（衰减+爆头）/ 换弹 /
 * 投射物（能量弹、火箭）与爆炸伤害。所有敌人伤害经此结算。
 */

const DEG = Math.PI / 180;

interface Projectile {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  def: WeaponDef;
  mesh: THREE.Mesh;
}

const MAX_PROJECTILES = 40;

export class WeaponSystem {
  // 装备
  private slots: (WeaponDef | null)[] = [null, null];
  private slotIndex = 0;
  // 弹药
  private mag = new Array(2).fill(0);
  private reserve = new Array(2).fill(0);

  private cooldown = 0;
  private reloadT = -1;
  private bloomAccum = 0;
  private switchT = 0;
  private triggerHeld = false;
  private semiLatch = false;

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
  equip(primary: WeaponDef, secondary: WeaponDef): void {
    this.slots = [primary, secondary];
    this.slotIndex = 0;
    for (let i = 0; i < 2; i++) {
      const d = this.slots[i]!;
      this.mag[i] = d.mag;
      this.reserve[i] = d.mag * d.reserveMags;
    }
    this.switchTo(0, true);
  }

  get current(): WeaponDef { return this.slots[this.slotIndex]!; }
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
    this.pushAmmoHud();
  }

  private pushAmmoHud(): void {
    const def = this.current;
    this.hooks.setAmmo(this.mag[this.slotIndex]!, this.reserve[this.slotIndex]!, def.name, this.isReloading);
  }

  // ----------------------------------------------------------
  // 帧更新
  // ----------------------------------------------------------
  update(dt: number, enemyTargets: EnemyLike[]): void {
    this.cooldown -= dt;
    if (this.switchT > 0) this.switchT -= dt;
    this.bloomAccum = Math.max(0, this.bloomAccum - dt * 6);

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
    this.cooldown = 60 / def.rpm;
    this.pushAmmoHud();

    // 视听反馈
    this.audio.shoot(def.class);
    const recoilPower = THREE.MathUtils.clamp(def.recoilV / 2, 0.3, 2.2);
    this.viewmodel.triggerRecoil(recoilPower);
    this.player.applyRecoil(def.recoilV * DEG * 0.16, (Math.random() - 0.5) * def.recoilH * DEG * 0.12);
    this.player.addShake(def.recoilV * 0.012);

    // 散布（腰射/机瞄 + bloom）
    const ads = this.viewmodel.isAds();
    const baseSpread = (ads ? def.adsSpread : def.hipSpread) + this.bloomAccum;
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
        this.spawnProjectile(origin, dir, def, muzzlePos);
      } else {
        this.hitscan(origin, dir, def, muzzlePos, enemies, i === 0);
      }
    }
  }

  private hitscan(origin: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef, muzzlePos: THREE.Vector3, enemies: EnemyLike[], showTracer: boolean): void {
    const maxDist = 150;
    const worldHit = this.physics.raycast(origin, dir, maxDist);
    let bestDist = worldHit ? worldHit.dist : maxDist;
    let hitEnemy: EnemyLike | null = null;
    let hitHead = false;
    let hitPoint: THREE.Vector3 | null = null;

    let pierceLeft = def.pierce - 1;
    const pierced = new Set<number>();

    // 多段穿透：依次找下一命中
    let segOrigin = origin;
    let remaining = bestDist;
    let totalEnemyDmg = 0;

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

      // 伤害：衰减 + 爆头
      const dist = segBest.dist;
      const falloff = falloffMult(def, dist);
      let dmg = def.damage * falloff;
      if (segBest.isHead) dmg *= def.headshotMult;
      dmg = Math.max(1, Math.round(dmg));
      totalEnemyDmg += dmg;

      this.effects.spark(segBest.point, dir.clone().negate(), segBest.isHead ? '#ffe08a' : '#ff7a55', 5, 3);
      const killed = segBest.enemy.applyDamage(dmg, segBest.isHead);
      this.hooks.damageNumber(segBest.point, dmg, segBest.isHead);
      this.hooks.hitmarker(segBest.isHead);
      this.audio.hit(segBest.isHead);
      this.damageDealt += dmg;
      this.hitsCount++;
      if (killed) {
        this.kills++;
        this.audio.killConfirm();
      }

      if (pierceLeft <= 0) {
        hitEnemy = segBest.enemy; hitHead = segBest.isHead; hitPoint = segBest.point; bestDist = segBest.dist;
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
      this.effects.tracer(muzzlePos, endPoint, def.accent, def.class === 'sniper' ? 0.03 : 0.018);
    }
    if (!hitEnemy && worldHit) {
      this.effects.spark(worldHit.point, worldHit.normal, '#c8cdd4', 6, 3.5);
    }
  }

  // ----------------------------------------------------------
  // 投射物（能量弹/火箭）
  // ----------------------------------------------------------
  private spawnProjectile(origin: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef, muzzlePos: THREE.Vector3): void {
    let p = this.projectiles.find((x) => !x.alive);
    if (!p) {
      if (this.projectiles.length >= MAX_PROJECTILES) return;
      const geo = new THREE.SphereGeometry(0.09, 8, 6);
      const mat = new THREE.MeshBasicMaterial({ color: def.accent });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      p = { alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, def, mesh };
      this.projectiles.push(p);
    }
    (p.mesh.material as THREE.MeshBasicMaterial).color.set(def.accent);
    p.alive = true;
    p.def = def;
    // 从枪口出发（避免贴脸命中自己面前的掩体）
    p.pos.copy(muzzlePos);
    p.vel.copy(dir).multiplyScalar(def.projectileSpeed);
    p.life = 4;
    p.mesh.visible = true;
    p.mesh.scale.setScalar(def.blastRadius > 0 ? 1.8 : 1);
  }

  private updateProjectiles(dt: number, enemies: EnemyLike[]): void {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; p.mesh.visible = false; continue; }

      const step = p.vel.clone().multiplyScalar(dt);
      const dist = step.length();
      const dir = step.clone().normalize();

      // 命中世界
      const worldHit = this.physics.raycast(p.pos, dir, dist);
      // 命中敌人
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
      // 能量弹拖尾
      this.effects.spark(p.pos, dir.clone().negate(), p.def.accent, 1, 0.4);
    }
  }

  private explode(p: Projectile, point: THREE.Vector3, enemies: EnemyLike[], directEnemy: EnemyLike | null, directHead: boolean): void {
    const def = p.def;
    if (def.blastRadius > 0) {
      this.effects.explosion(point, def.blastRadius, def.accent);
      this.audio.explosion();
      // 范围伤害
      for (const e of enemies) {
        if (!e.alive) continue;
        const center = e.pos.clone(); center.y += e.height * 0.5;
        const d = center.distanceTo(point);
        if (d > def.blastRadius) continue;
        const k = 1 - (d / def.blastRadius) * 0.55;
        const dmg = Math.max(1, Math.round(def.damage * k));
        const killed = e.applyDamage(dmg, false);
        this.hooks.damageNumber(center, dmg, false);
        if (killed) { this.kills++; this.audio.killConfirm(); }
        this.damageDealt += dmg;
      }
      if (directEnemy) {
        const dmg = Math.max(1, Math.round(def.damage * 0.35 * (directHead ? 1.5 : 1)));
        const killed = directEnemy.applyDamage(dmg, directHead);
        if (killed) { this.kills++; this.audio.killConfirm(); }
      }
      // 玩家自伤（火箭近距离）
      const pc = this.player.pos.clone(); pc.y += 1;
      const pd = pc.distanceTo(point);
      if (pd < def.blastRadius * 0.8) {
        this.player.damage(Math.round(def.damage * 0.08 * (1 - pd / (def.blastRadius * 0.8))));
      }
    } else {
      // 直击能量弹
      const target = directEnemy;
      if (target) {
        const dmg = Math.max(1, Math.round(def.damage * (directHead ? def.headshotMult : 1)));
        const killed = target.applyDamage(dmg, directHead);
        this.hooks.damageNumber(point, dmg, directHead);
        this.hooks.hitmarker(directHead);
        this.audio.hit(directHead);
        this.damageDealt += dmg;
        if (killed) { this.kills++; this.audio.killConfirm(); }
        this.effects.spark(point, p.vel.clone().normalize().negate(), def.accent, 6, 3);
      } else {
        this.effects.spark(point, new THREE.Vector3(0, 1, 0), def.accent, 5, 3);
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
  // 在垂直平面内偏移
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  return dir
    .addScaledVector(right, Math.cos(a) * Math.tan(r))
    .addScaledVector(up, Math.sin(a) * Math.tan(r))
    .normalize();
}

function falloffMult(def: WeaponDef, dist: number): number {
  if (dist <= def.falloffStart) return 1;
  const t = THREE.MathUtils.clamp((dist - def.falloffStart) / (def.falloffEnd - def.falloffStart), 0, 1);
  return 1 - t * (1 - def.falloffMin);
}
