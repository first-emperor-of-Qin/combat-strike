import * as THREE from 'three';
import { tierDps } from '@combat-strike/shared';
import type { WeaponDef, SkillType, Element } from '@combat-strike/shared';
import type { Physics, RayHit } from '../world/physics.js';
import type { Effects } from '../world/effects.js';
import type { AudioEngine } from '../core/audio.js';
import type { Player } from '../player/controller.js';
import type { EnemyLike } from '../types.js';

/**
 * 武器主动技能系统 —— 每把武器的专属技能（中键/F 释放）。
 * 伤害以品级 DPS 曲线为基准，与武器等级同步成长。
 */

/** 武器系统暴露给技能的伤害桥 */
export interface CombatBridge {
  applySkillDamage(enemy: EnemyLike, dmg: number, point: THREE.Vector3, headshot: boolean, element: Element): void;
  applyAreaSkillDamage(center: THREE.Vector3, radius: number, dmg: number, element: Element, burnDps?: number): void;
  nearestEnemies(origin: THREE.Vector3, maxCount: number, maxDist: number): EnemyLike[];
  spawnHomingProjectile(origin: THREE.Vector3, dir: THREE.Vector3, def: WeaponDef, dmgMult: number, color: string): void;
  raycastWorld(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null;
}

export interface SkillHooks {
  setSkill(name: string, cdFrac: number, ready: boolean): void;
  announce(text: string, sub?: string): void;
}

// ---- 区域效果（冰封领域 / 奇点坍缩 / 灼烧带） ----
interface Zone {
  kind: 'frost' | 'blackhole' | 'fire';
  pos: THREE.Vector3;
  radius: number;
  life: number;
  maxLife: number;
  dps: number;
  element: Element;
  group: THREE.Group;
  ring: THREE.Mesh;
  core?: THREE.Mesh;
  tickT: number;
}

const ELEMENT_COLORS: Record<Element, string> = {
  none: '#c8cdd4', fire: '#ff6a2a', ice: '#6fd8ff',
  lightning: '#ffe95c', void: '#b26bff', holy: '#ffd75c',
};

export class SkillSystem {
  private zones: Zone[] = [];
  private zonePool: Zone[] = [];

  private cd = 0;
  private def: WeaponDef | null = null;

  // 持续型增益
  overdriveT = 0;
  shadowstepT = 0;
  /** 狂暴射速倍率 */
  get rpmMult(): number { return this.overdriveT > 0 ? 1.65 : 1; }

  constructor(
    private scene: THREE.Scene,
    private physics: Physics,
    private effects: Effects,
    private audio: AudioEngine,
    private player: Player,
    private bridge: CombatBridge,
    private hooks: SkillHooks,
    private camera: () => THREE.PerspectiveCamera,
  ) {}

  /** 切换武器时重置冷却 */
  setWeapon(def: WeaponDef): void {
    this.def = def;
    this.cd = 0;
    this.overdriveT = 0;
    this.shadowstepT = 0;
    this.hooks.setSkill(def.skill.name, 0, true);
  }

  get cooldownFrac(): number {
    if (!this.def) return 1;
    return Math.max(0, this.cd / this.def.skill.cooldown);
  }

  get ready(): boolean { return this.cd <= 0 && this.def !== null; }

  tryCast(): boolean {
    if (!this.ready || !this.def) return false;
    this.cd = this.def.skill.cooldown;
    this.cast(this.def.skill.type, this.def);
    return true;
  }

  update(dt: number, enemies: EnemyLike[]): void {
    if (this.cd > 0) {
      this.cd -= dt;
      const def = this.def;
      if (def) this.hooks.setSkill(def.skill.name, this.cooldownFrac, this.ready);
    }
    if (this.overdriveT > 0) this.overdriveT -= dt;
    if (this.shadowstepT > 0) {
      this.shadowstepT -= dt;
      if (this.shadowstepT <= 0) {
        this.player.damageTakenMult = 1;
        this.player.speedBuffMult = 1;
      }
    }
    this.updateZones(dt, enemies);
  }

  // ============================================================
  // 技能实现
  // ============================================================
  private cast(type: SkillType, def: WeaponDef): void {
    const cam = this.camera();
    const base = tierDps(def.tier);
    const origin = cam.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const element = def.element;
    const color = ELEMENT_COLORS[element];

    switch (type) {
      case 'powerShot': {
        const shots = def.id === 'parasite' ? 1 : def.id === 'golden-duel' ? 2 : 3;
        const mult = def.id === 'parasite' ? 5 : def.id === 'golden-duel' ? 4 : 3;
        this.onPowerShot?.(shots, mult);
        this.audio.uiClick();
        this.hooks.announce(def.skill.name, `接下来 ${shots} 发伤害 ×${mult}`);
        break;
      }
      case 'shadowstep': {
        this.shadowstepT = 4;
        this.player.speedBuffMult = 1.45;
        this.player.damageTakenMult = 0.6;
        this.player.invulnT = Math.max(this.player.invulnT, 0.4);
        this.audio.jump();
        this.effects.spark(this.player.pos.clone().setY(1), dir, '#b26bff', 14, 4);
        this.hooks.announce(def.skill.name, '移速 +45% · 受伤 -40%');
        break;
      }
      case 'overdrive': {
        this.overdriveT = def.id === 'blood-shark' ? 5 : 4;
        this.onOverdrive?.(this.overdriveT);
        this.audio.waveStart();
        this.hooks.announce(def.skill.name, '射速狂暴！');
        break;
      }
      case 'fireNova': {
        const radius = def.id === 'yanmo-launcher' ? 9 : 6.5;
        // 位置：炎魔领域在准星处，其余以自身为中心
        const center = def.id === 'yanmo-launcher' || def.id === 'dragon-knight'
          ? this.crosshairGroundPoint(origin, dir, 18)
          : this.player.pos.clone().setY(0.4);
        this.effects.explosion(center, radius * 0.55, '#ff6a2a');
        this.effects.spark(center, new THREE.Vector3(0, 1, 0), '#ff8a3c', 30, radius * 0.9);
        this.audio.explosion();
        const dmg = Math.round(base * (def.id === 'yanmo-launcher' ? 5 : 3.5));
        this.bridge.applyAreaSkillDamage(center, radius, dmg, 'fire', base * 0.35);
        this.hooks.announce(def.skill.name, '灼烧一切');
        break;
      }
      case 'frostField': {
        const center = this.crosshairGroundPoint(origin, dir, 24);
        this.spawnZone('frost', center, 5.5, 5, base * 0.7, 'ice');
        this.audio.waveStart();
        this.hooks.announce(def.skill.name, '冰封领域展开');
        break;
      }
      case 'chainLightning': {
        const targets = this.bridge.nearestEnemies(origin, 6, 28);
        let prev = origin.clone();
        let dmg = Math.round(base * 2.4);
        for (const e of targets) {
          const hitPos = e.pos.clone().setY(e.pos.y + e.height * 0.6);
          this.drawLightning(prev, hitPos);
          this.bridge.applySkillDamage(e, dmg, hitPos, false, 'lightning');
          (e as { applyStatus?: (k: string, d: number, p: number) => void }).applyStatus?.('shock', 1.2, 0);
          prev = hitPos;
          dmg = Math.max(1, Math.round(dmg * 0.78));
        }
        this.audio.shoot('energy');
        this.hooks.announce(def.skill.name, `雷链命中 ${targets.length} 名敌人`);
        break;
      }
      case 'barrage': {
        const count = def.id === 'dimension-star' ? 10 : 8;
        for (let i = 0; i < count; i++) {
          const spread = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.35, (Math.random() - 0.5)).normalize();
          const d = dir.clone().addScaledVector(spread, 0.35).normalize();
          this.bridge.spawnHomingProjectile(origin, d, def, 0.85, color);
        }
        this.audio.shoot('energy');
        this.hooks.announce(def.skill.name, `${count} 枚追踪弹齐射`);
        break;
      }
      case 'blink': {
        const hit = this.physics.raycast(origin, dir, 12);
        const dist = hit ? Math.max(1.2, hit.dist - 1) : 12;
        const dest = origin.clone().addScaledVector(dir, dist);
        dest.y = 0;
        this.effects.spark(origin, dir.clone().negate(), '#ff4fd8', 12, 4);
        this.player.pos.set(dest.x, 0, dest.z);
        this.player.invulnT = Math.max(this.player.invulnT, 0.6);
        this.effects.spark(this.player.pos.clone().setY(1), dir, '#ff4fd8', 12, 4);
        this.audio.jump();
        this.hooks.announce(def.skill.name, '相位位移');
        break;
      }
      case 'railBeam': {
        // 全屏贯穿光束
        const maxDist = 200;
        const enemies = this.bridge.nearestEnemies(origin, 64, maxDist);
        const beamDir = dir.clone();
        const endPoint = origin.clone().addScaledVector(beamDir, maxDist);
        this.effects.tracer(origin, endPoint, '#7df9ff', 0.14);
        this.effects.tracer(origin, endPoint, '#ffffff', 0.05);
        for (const e of enemies) {
          const center = e.pos.clone().setY(e.pos.y + e.height * 0.55);
          const toE = center.clone().sub(origin);
          const proj = toE.dot(beamDir);
          if (proj <= 0) continue;
          const perp = toE.clone().addScaledVector(beamDir, -proj);
          if (perp.length() < e.radius + 0.9) {
            const hitPos = origin.clone().addScaledVector(beamDir, proj);
            this.bridge.applySkillDamage(e, Math.round(base * 6), hitPos, false, 'lightning');
            this.effects.spark(hitPos, beamDir.clone().negate(), '#7df9ff', 6, 4);
          }
        }
        this.player.addShake(0.25);
        this.audio.explosion();
        this.hooks.announce(def.skill.name, '贯 空');
        break;
      }
      case 'blackhole': {
        const center = this.crosshairGroundPoint(origin, dir, 30);
        this.spawnZone('blackhole', center, 6.5, 4.5, base * 1.4, 'void');
        this.audio.explosion();
        this.hooks.announce(def.skill.name, '奇点坍缩');
        break;
      }
      case 'healBurst': {
        this.player.heal(Math.round(this.player.maxHp * 0.35));
        const center = this.player.pos.clone().setY(0.6);
        this.effects.explosion(center, 4, '#ffd75c');
        this.effects.spark(center, new THREE.Vector3(0, 1, 0), '#ffe9a0', 22, 5);
        this.bridge.applyAreaSkillDamage(center, 5.5, Math.round(base * 2), 'holy');
        this.audio.levelUp();
        this.hooks.announce(def.skill.name, '生命回复 · 圣光审判');
        break;
      }
    }
  }

  /** 供武器系统注册强化弹回调 */
  onPowerShot?: (shots: number, mult: number) => void;
  onOverdrive?: (duration: number) => void;

  /** 视线落点（地面/箱面），限制最大距离 */
  private crosshairGroundPoint(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): THREE.Vector3 {
    const hit = this.physics.raycast(origin, dir, maxDist);
    if (hit) return hit.point.clone().setY(Math.max(0.05, hit.point.y));
    const p = origin.clone().addScaledVector(dir, maxDist);
    return p.setY(Math.max(0.05, p.y - 1.6));
  }

  private drawLightning(from: THREE.Vector3, to: THREE.Vector3): void {
    // 折线电弧
    const segs = 5;
    let prev = from.clone();
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = from.clone().lerp(to, t);
      if (i < segs) {
        p.x += (Math.random() - 0.5) * 1.4;
        p.y += (Math.random() - 0.5) * 1.0;
        p.z += (Math.random() - 0.5) * 1.4;
      }
      this.effects.tracer(prev, p, '#ffe95c', 0.05);
      prev = p;
    }
    this.effects.spark(to, new THREE.Vector3(0, 1, 0), '#ffe95c', 6, 3);
  }

  // ============================================================
  // 区域效果
  // ============================================================
  private spawnZone(kind: Zone['kind'], pos: THREE.Vector3, radius: number, life: number, dps: number, element: Element): void {
    let z = this.zonePool.pop();
    if (!z) {
      const group = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(0.92, 1, 40);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
      group.add(ring);
      const coreGeo = new THREE.SphereGeometry(1, 16, 12);
      const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.position.y = 0.8;
      group.add(core);
      this.scene.add(group);
      z = { kind, pos: new THREE.Vector3(), radius, life, maxLife: life, dps, element, group, ring, core, tickT: 0 };
    }
    z.kind = kind; z.radius = radius; z.life = z.maxLife = life; z.dps = dps; z.element = element; z.tickT = 0;
    z.pos.copy(pos);
    z.group.position.copy(pos);
    z.group.visible = true;
    z.ring.scale.setScalar(radius);
    (z.ring.material as THREE.MeshBasicMaterial).color.set(ELEMENT_COLORS[element]);
    if (z.core) {
      z.core.scale.setScalar(radius * (kind === 'blackhole' ? 0.45 : 0.8));
      (z.core.material as THREE.MeshBasicMaterial).color.set(ELEMENT_COLORS[element]);
    }
    this.zones.push(z);
  }

  private updateZones(dt: number, enemies: EnemyLike[]): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]!;
      z.life -= dt;
      z.tickT -= dt;
      const color = ELEMENT_COLORS[z.element];

      if (z.kind === 'blackhole' && z.core) {
        // 核心 rotate + 脉动
        z.core.rotation.y += dt * 3;
        z.core.rotation.x += dt * 1.4;
        const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.15;
        z.core.scale.setScalar(z.radius * 0.45 * pulse);
      }
      // 环形缩放呼吸
      const k = 0.96 + Math.sin(performance.now() * 0.004) * 0.04;
      z.ring.scale.setScalar(z.radius * k);
      (z.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.min(1, z.life / 0.8);

      // 粒子
      if (Math.random() < dt * (z.kind === 'blackhole' ? 30 : 12)) {
        const ang = Math.random() * Math.PI * 2;
        const r = z.radius * (0.4 + Math.random() * 0.6);
        const edge = z.pos.clone().add(new THREE.Vector3(Math.cos(ang) * r, 0.3, Math.sin(ang) * r));
        const toward = z.kind === 'blackhole'
          ? z.pos.clone().setY(1).sub(edge).normalize()
          : new THREE.Vector3(0, 1, 0);
        this.effects.spark(edge, toward, color, 1, z.kind === 'blackhole' ? 5 : 2);
      }

      // 周期伤害与效果
      if (z.tickT <= 0) {
        z.tickT = 0.5;
        for (const e of enemies) {
          if (!e.alive) continue;
          const center = e.pos.clone(); center.y += 0.2;
          const d = center.distanceTo(z.pos);
          if (d > z.radius) continue;

          // 奇点牵引
          if (z.kind === 'blackhole') {
            const pull = z.pos.clone().sub(e.pos).setY(0).normalize().multiplyScalar(Math.min(0.35, dt * 6));
            (e.pos as THREE.Vector3).addScaledVector(z.pos.clone().sub(e.pos).setY(0).normalize(), 0.22);
            void pull;
          }
          // 冰封减速
          if (z.kind === 'frost') {
            (e as { applyStatus?: (k: string, dur: number, p: number) => void }).applyStatus?.('slow', 1.2, 0.45);
          }
          // 灼烧
          if (z.kind === 'fire') {
            (e as { applyStatus?: (k: string, dur: number, p: number) => void }).applyStatus?.('burn', 2, z.dps * 0.5);
          }
          const dmg = Math.max(1, Math.round(z.dps * 0.5));
          this.bridge.applySkillDamage(e, dmg, e.pos.clone().setY(e.pos.y + e.height * 0.5), false, z.element);
        }
      }

      if (z.life <= 0) {
        z.group.visible = false;
        this.zones.splice(i, 1);
        this.zonePool.push(z);
      }
    }
  }

  clearZones(): void {
    for (const z of this.zones) z.group.visible = false;
    this.zones.length = 0;
  }
}
