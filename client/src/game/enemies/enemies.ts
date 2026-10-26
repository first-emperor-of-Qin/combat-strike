import * as THREE from 'three';
import { ENEMIES, enemyHpMult, enemyDamageMult, BOSS_HP_MULT, KIND_HP_MULT } from '@combat-strike/shared';
import type { EnemyKind } from '@combat-strike/shared';
import type { Physics } from '../world/physics.js';
import type { Effects } from '../world/effects.js';
import type { AudioEngine } from '../core/audio.js';
import type { Player } from '../player/controller.js';
import type { EnemyLike } from '../types.js';

/**
 * 敌人系统：程序化敌兵建模 + 状态机 AI（索敌/接近/前摇/攻击/死亡），
 * 远程弹幕、自爆、无人机悬停、精英词条与 BOSS 阶段模式。
 */

let NEXT_ID = 1;

const KIND_COLORS: Record<EnemyKind, { body: string; accent: string }> = {
  grunt:  { body: '#7a8a72', accent: '#b8e06a' },
  runner: { body: '#a07a52', accent: '#ffb03c' },
  ranged: { body: '#5a7a9a', accent: '#5fd0ff' },
  heavy:  { body: '#6c6c7c', accent: '#ff7070' },
  bomber: { body: '#8a5a74', accent: '#d0ff5f' },
  drone:  { body: '#63686f', accent: '#ff6fe0' },
  elite:  { body: '#545464', accent: '#ffd75c' },
  boss:   { body: '#3a3a48', accent: '#ff3860' },
};

function mkMat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...opts });
}

function part(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** 敌人近战/远程攻击命中玩家的回调 */
export interface EnemyHooks {
  onPlayerDamaged(amount: number, fromPos: THREE.Vector3): void;
  onEnemyKilled(kind: EnemyKind, pos: THREE.Vector3, isBoss: boolean): void;
}

interface EnemyBolt {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  mesh: THREE.Mesh;
  life: number;
}

export class Enemy implements EnemyLike {
  readonly id = NEXT_ID++;
  alive = true;
  pos = new THREE.Vector3();
  radius: number;
  height: number;
  isBoss: boolean;
  kind: EnemyKind;
  name: string;

  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  attackRange: number;
  attackInterval: number;

  private group = new THREE.Group();
  private bodyMats: THREE.MeshStandardMaterial[] = [];
  private accentMats: THREE.MeshStandardMaterial[] = [];
  private state: 'seek' | 'windup' | 'recover' = 'seek';
  private stateT = 0;
  private walkT = Math.random() * 10;
  private hoverT = Math.random() * 10;
  private flashT = 0;
  private deadT = 0;
  private strafeDir = Math.random() < 0.5 ? 1 : -1;
  private strafeT = 0;
  private lastBoltT = 0;

  // BOSS
  private phase = 0;
  private patternT = 2;

  constructor(
    kind: EnemyKind,
    chapter: number,
    accentOverride: string | undefined,
    private physics: Physics,
    private effects: Effects,
    private audio: AudioEngine,
    private hooks: EnemyHooks,
    private fireBolt: (from: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, color: string) => void,
  ) {
    const def = ENEMIES[kind];
    this.kind = kind;
    this.name = def.name;
    this.isBoss = kind === 'boss';
    const hpMult = kind === 'boss' ? BOSS_HP_MULT : KIND_HP_MULT[kind];
    this.maxHp = Math.round(def.hp * hpMult * enemyHpMult(chapter));
    this.hp = this.maxHp;
    this.damage = Math.round(def.damage * enemyDamageMult(chapter));
    this.speed = def.speed * (1 + chapter * 0.015);
    this.attackRange = def.attackRange;
    this.attackInterval = def.attackInterval;
    this.radius = def.radius * (kind === 'boss' ? 1 : 1);
    this.height = def.height;

    const colors = KIND_COLORS[kind];
    const body = mkMat(colors.body);
    body.emissive = new THREE.Color(colors.body).multiplyScalar(0.22);
    const accent = mkMat(accentOverride ?? colors.accent, { emissive: accentOverride ?? colors.accent, emissiveIntensity: 2.0 });
    this.bodyMats.push(body);
    this.accentMats.push(accent);
    this.buildModel(body, accent, chapter);
    this.group.visible = true;
  }

  private buildModel(body: THREE.MeshStandardMaterial, accent: THREE.MeshStandardMaterial, chapter: number): void {
    const g = this.group;
    const k = this.kind;
    if (k === 'drone') {
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), body);
      core.position.y = 0.55;
      core.castShadow = true;
      g.add(core);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 20), accent);
      ring.position.y = 0.55;
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), accent);
      eye.position.set(0, 0.55, -0.28);
      g.add(eye);
      return;
    }
    if (k === 'bomber') {
      const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), body);
      torso.position.y = 0.7;
      torso.scale.y = 1.15;
      torso.castShadow = true;
      g.add(torso);
      const strip = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 8, 20), accent);
      strip.position.y = 0.7;
      strip.rotation.x = Math.PI / 2;
      g.add(strip);
      const legL = part(0.12, 0.3, 0.12, body, -0.16, 0.15, 0);
      const legR = part(0.12, 0.3, 0.12, body, 0.16, 0.15, 0);
      g.add(legL, legR);
      return;
    }
    if (k === 'boss') {
      // 巨型 BOSS：躯干+双肩+核心+双腿
      const scale = 1 + chapter * 0.02;
      const torso = part(1.7 * scale, 1.9 * scale, 1.1 * scale, body, 0, 2.3 * scale, 0);
      const head = part(0.8 * scale, 0.7 * scale, 0.8 * scale, body, 0, 3.5 * scale, -0.1);
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 * scale), accent);
      core.position.set(0, 2.4 * scale, -0.5 * scale);
      const shoulderL = part(0.8 * scale, 0.7 * scale, 0.9 * scale, body, -1.2 * scale, 3 * scale, 0);
      const shoulderR = part(0.8 * scale, 0.7 * scale, 0.9 * scale, body, 1.2 * scale, 3 * scale, 0);
      const armL = part(0.45 * scale, 1.6 * scale, 0.5 * scale, body, -1.25 * scale, 1.9 * scale, 0);
      const armR = part(0.45 * scale, 1.6 * scale, 0.5 * scale, body, 1.25 * scale, 1.9 * scale, 0);
      const legL = part(0.55 * scale, 1.4 * scale, 0.6 * scale, body, -0.5 * scale, 0.7 * scale, 0);
      const legR = part(0.55 * scale, 1.4 * scale, 0.6 * scale, body, 0.5 * scale, 0.7 * scale, 0);
      g.add(torso, head, core, shoulderL, shoulderR, armL, armR, legL, legR);
      this.group.userData.core = core;
      return;
    }

    // 人形（grunt/runner/ranged/heavy/elite）
    const bulk = k === 'heavy' ? 1.35 : k === 'elite' ? 1.18 : k === 'runner' ? 0.82 : 1;
    const h = this.height;
    const torso = part(0.5 * bulk, h * 0.42, 0.32 * bulk, body, 0, h * 0.62, 0);
    const head = part(0.26 * bulk, 0.26 * bulk, 0.26 * bulk, body, 0, h * 0.9, 0);
    const visor = part(0.22 * bulk, 0.07, 0.03, accent, 0, h * 0.9, -0.13 * bulk);
    const armL = part(0.14 * bulk, h * 0.36, 0.14 * bulk, body, -0.34 * bulk, h * 0.62, 0);
    const armR = part(0.14 * bulk, h * 0.36, 0.14 * bulk, body, 0.34 * bulk, h * 0.62, 0);
    const legL = part(0.17 * bulk, h * 0.42, 0.17 * bulk, body, -0.14 * bulk, h * 0.21, 0);
    const legR = part(0.17 * bulk, h * 0.42, 0.17 * bulk, body, 0.14 * bulk, h * 0.21, 0);
    g.add(torso, head, visor, armL, armR, legL, legR);
    if (k === 'heavy') {
      const shield = part(0.9, h * 0.55, 0.08, accent, 0, h * 0.5, -0.42 * bulk);
      g.add(shield);
    }
    if (k === 'ranged') {
      const cannon = part(0.14, 0.14, 0.5, accent, 0.34 * bulk, h * 0.6, -0.24);
      g.add(cannon);
    }
    if (k === 'elite') {
      const spikeL = part(0.1, 0.3, 0.1, accent, -0.42 * bulk, h * 0.88, 0);
      const spikeR = part(0.1, 0.3, 0.1, accent, 0.42 * bulk, h * 0.88, 0);
      g.add(spikeL, spikeR);
    }
  }

  get object3d(): THREE.Object3D { return this.group; }
  get headHeight(): number { return this.height * 0.9; }

  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { dist: number; isHead: boolean; point: THREE.Vector3 } | null {
    if (!this.alive) return null;
    // 头部球
    const headC = this.pos.clone(); headC.y += this.height * 0.9;
    const headR = this.isBoss ? this.height * 0.16 : 0.24;
    const headHit = raySphere(origin, dir, headC, headR);
    // 身体（竖直胶囊近似：两段球）
    const bodyC = this.pos.clone(); bodyC.y += this.height * 0.5;
    const bodyR = this.isBoss ? this.height * 0.34 : this.radius + 0.16;
    const bodyHit = raySphere(origin, dir, bodyC, bodyR);
    const legC = this.pos.clone(); legC.y += this.height * 0.22;
    const legHit = raySphere(origin, dir, legC, bodyR * 0.85);

    let best: { dist: number; isHead: boolean; point: THREE.Vector3 } | null = null;
    for (const h of [headHit && { ...headHit, isHead: true }, bodyHit && { ...bodyHit, isHead: false }, legHit && { ...legHit, isHead: false }]) {
      if (!h) continue;
      if (h.dist > maxDist) continue;
      if (!best || h.dist < best.dist) {
        best = { dist: h.dist, isHead: h.isHead, point: origin.clone().addScaledVector(dir, h.dist) };
      }
    }
    return best;
  }

  applyDamage(amount: number, isHead: boolean): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flashT = 0.09;
    void isHead;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private die(): void {
    this.alive = false;
    this.deadT = 2.2;
    this.effects.spark(this.pos.clone().setY(this.pos.y + this.height * 0.6), new THREE.Vector3(0, 1, 0), KIND_COLORS[this.kind].accent, this.isBoss ? 40 : 14, this.isBoss ? 8 : 4);
    if (this.kind === 'bomber') {
      this.effects.explosion(this.pos.clone().setY(0.8), 2.2, '#c3ff4f');
      this.audio.explosion();
    }
    this.hooks.onEnemyKilled(this.kind, this.pos.clone(), this.isBoss);
  }

  /** 更新 AI；返回 true 表示仍在场（false = 可回收） */
  update(dt: number, player: Player, others: Enemy[], time: number): boolean {
    if (!this.alive) {
      // 死亡动画：倒地 + 下沉
      this.deadT -= dt;
      this.group.rotation.x = Math.min(Math.PI / 2, this.group.rotation.x + dt * 3.4);
      if (this.deadT < 0.9) this.group.position.y = -(2.2 - this.deadT) * (this.isBoss ? 1.6 : 1);
      return this.deadT > 0;
    }

    // 受击闪白
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / 0.09);
      for (const m of this.bodyMats) m.emissive.setRGB(k * 0.9, k * 0.9, k * 0.9);
    } else {
      for (const m of this.bodyMats) m.emissive.setRGB(0, 0, 0);
    }

    const toPlayer = player.pos.clone().sub(this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    if (this.kind === 'drone') {
      this.updateDrone(dt, player, toPlayer, dist);
    } else if (this.isBoss) {
      this.updateBoss(dt, player, toPlayer, dist, time);
    } else if (this.kind === 'ranged') {
      this.updateRanged(dt, player, toPlayer, dist, time);
    } else {
      this.updateMelee(dt, player, toPlayer, dist);
    }

    // 朝向玩家
    const targetYaw = Math.atan2(-toPlayer.x, -toPlayer.z) + Math.PI;
    this.group.rotation.y = targetYaw;

    // 模型位置同步（走动摆动）
    if (this.kind !== 'drone') {
      const speedNow = this.state === 'seek' ? this.speed : 0;
      this.walkT += dt * speedNow * 2.2;
      this.group.position.set(this.pos.x, this.pos.y + Math.abs(Math.sin(this.walkT)) * 0.06, this.pos.z);
      this.group.rotation.z = Math.sin(this.walkT) * 0.05 * (this.state === 'seek' ? 1 : 0);
    }
    return true;
  }

  private updateMelee(dt: number, player: Player, toPlayer: THREE.Vector3, dist: number): void {
    this.stateT -= dt;
    if (this.state === 'seek') {
      if (dist > this.attackRange * 0.9) {
        const dir = toPlayer.clone().normalize();
        // 与玩家保持最小间距（避免贴脸糊屏）
        const step = Math.min(this.speed * dt, Math.max(0, dist - 1.35));
        this.pos.addScaledVector(dir, step);
        // 简单推离静态障碍
        this.resolveStatic();
      } else if (this.stateT <= 0) {
        this.state = 'windup';
        this.stateT = 0.38;
        for (const m of this.accentMats) m.emissiveIntensity = 3.5;
      }
    } else if (this.state === 'windup') {
      if (this.stateT <= 0) {
        if (dist < this.attackRange * 1.35) {
          player.damage(this.damage);
          this.hooks.onPlayerDamaged(this.damage, this.pos);
          this.audio.hurt();
        }
        this.state = 'recover';
        this.stateT = this.attackInterval;
        for (const m of this.accentMats) m.emissiveIntensity = 1.4;
      }
    } else {
      if (this.stateT <= 0) { this.state = 'seek'; this.stateT = 0; }
    }
    this.separateFrom(null);
  }

  private updateRanged(dt: number, player: Player, toPlayer: THREE.Vector3, dist: number, time: number): void {
    this.stateT -= dt;
    const preferred = this.attackRange * 0.6;
    if (this.state === 'seek') {
      if (dist > preferred) {
        this.pos.addScaledVector(toPlayer.clone().normalize(), this.speed * dt);
        this.resolveStatic();
      } else if (dist < preferred * 0.5) {
        this.pos.addScaledVector(toPlayer.clone().normalize(), -this.speed * 0.7 * dt);
        this.resolveStatic();
      } else {
        // 横向游走
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = 1 + Math.random() * 1.6; }
        const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize();
        this.pos.addScaledVector(side, this.strafeDir * this.speed * 0.5 * dt);
        this.resolveStatic();
      }
      // 射击
      if (dist < this.attackRange && time - this.lastBoltT > this.attackInterval) {
        const canSee = !this.physics.losBlocked(this.eyePos(), player.eyePosition);
        if (canSee) {
          this.lastBoltT = time;
          this.state = 'windup';
          this.stateT = 0.45;
          for (const m of this.accentMats) m.emissiveIntensity = 4;
        }
      }
    } else if (this.state === 'windup') {
      if (this.stateT <= 0) {
        const from = this.eyePos();
        const target = player.eyePosition;
        const lead = target.clone().addScaledVector(player.vel, 0.18);
        const dir = lead.sub(from).normalize();
        this.fireBolt(from, dir, 26, this.damage, KIND_COLORS.ranged.accent);
        this.audio.enemyShoot();
        for (const m of this.accentMats) m.emissiveIntensity = 1.4;
        this.state = 'recover';
        this.stateT = 0.3;
      }
    } else {
      if (this.stateT <= 0) this.state = 'seek';
    }
  }

  private updateDrone(dt: number, player: Player, toPlayer: THREE.Vector3, dist: number): void {
    this.hoverT += dt * 2.2;
    const hover = 1.4 + Math.sin(this.hoverT) * 0.25;
    const preferred = this.attackRange * 0.55;
    if (dist > preferred) this.pos.addScaledVector(toPlayer.clone().normalize(), this.speed * dt);
    else if (dist < preferred * 0.6) this.pos.addScaledVector(toPlayer.clone().normalize(), -this.speed * 0.6 * dt);
    this.resolveStatic();
    this.group.position.set(this.pos.x, hover, this.pos.z);
    (this.group.children[1] as THREE.Mesh).rotation.z += dt * 2.4;

    // 发射浮雷弹
    if (dist < this.attackRange && this.hoverT - Math.floor(this.hoverT / this.attackInterval) * this.attackInterval < dt * 1.2) {
      const canSee = !this.physics.losBlocked(this.pos.clone().setY(hover), player.eyePosition);
      if (canSee) {
        const dir = player.eyePosition.sub(this.pos.clone().setY(hover)).normalize();
        this.fireBolt(this.pos.clone().setY(hover), dir, 22, this.damage, KIND_COLORS.drone.accent);
        this.audio.enemyShoot();
      }
    }
  }

  private updateBoss(dt: number, player: Player, toPlayer: THREE.Vector3, dist: number, time: number): void {
    // 阶段切换
    const frac = this.hp / this.maxHp;
    const newPhase = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.patternT = 1;
      this.effects.explosion(this.pos.clone().setY(2), 3, KIND_COLORS.boss.accent);
      for (const m of this.accentMats) m.emissiveIntensity = 3.5;
    }
    const speed = this.speed * (1 + this.phase * 0.35);

    this.patternT -= dt;
    if (dist > this.attackRange) {
      const step = Math.min(speed * dt, Math.max(0, dist - 2.6));
      this.pos.addScaledVector(toPlayer.clone().normalize(), step);
      this.resolveStatic();
    }

    if (this.patternT <= 0) {
      const roll = Math.random();
      const from = this.eyePos();
      const target = player.eyePosition;
      if (roll < 0.4) {
        // 三连弹幕
        for (let i = -1; i <= 1; i++) {
          const dir = target.clone().sub(from).normalize();
          const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
          dir.addScaledVector(side, i * 0.14).normalize();
          this.fireBolt(from, dir, 24, this.damage, KIND_COLORS.boss.accent);
        }
        this.audio.enemyShoot();
        this.patternT = 1.6 - this.phase * 0.3;
      } else if (roll < 0.7 && dist < 8) {
        // 跺地冲击波
        this.effects.explosion(this.pos.clone().setY(0.3), 4.5, KIND_COLORS.boss.accent);
        this.audio.explosion();
        if (dist < 6) {
          player.damage(Math.round(this.damage * 1.4));
          this.hooks.onPlayerDamaged(Math.round(this.damage * 1.4), this.pos);
          this.audio.hurt();
        }
        this.patternT = 2.2 - this.phase * 0.4;
      } else {
        // 五向扇形
        const base = target.clone().sub(from).normalize();
        for (let i = -2; i <= 2; i++) {
          const dir = base.clone();
          const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
          dir.addScaledVector(side, i * 0.2).normalize();
          this.fireBolt(from, dir, 20, this.damage, KIND_COLORS.boss.accent);
        }
        this.audio.enemyShoot();
        this.patternT = 2 - this.phase * 0.35;
      }
      void time;
    }
  }

  private eyePos(): THREE.Vector3 {
    return this.pos.clone().setY(this.pos.y + this.height * 0.75);
  }

  /** 推离静态障碍（简易） */
  private resolveStatic(): void {
    const p = this.physics;
    for (const b of p.boxes) {
      if (b.maxY < 0.4) continue; // 忽略矮台阶
      const cx = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
      const cz = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      const r = this.radius + 0.05;
      if (d2 < r * r && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        this.pos.x += (dx / d) * (r - d);
        this.pos.z += (dz / d) * (r - d);
      }
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, p.bounds.minX + this.radius, p.bounds.maxX - this.radius);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, p.bounds.minZ + this.radius, p.bounds.maxZ - this.radius);
  }

  private separateFrom(_other: Enemy | null): void { void _other; }

  addTo(parent: THREE.Object3D): void { parent.add(this.group); }
  removeFrom(parent: THREE.Object3D): void { parent.remove(this.group); }
}

// ============================================================
// 管理器
// ============================================================
export class EnemyManager {
  enemies: Enemy[] = [];
  bolts: EnemyBolt[] = [];
  group = new THREE.Group();
  private boltGeo = new THREE.SphereGeometry(0.12, 8, 6);

  constructor(
    private scene: THREE.Scene,
    private physics: Physics,
    private effects: Effects,
    private audio: AudioEngine,
    private player: Player,
    private hooks: EnemyHooks,
  ) {
    this.scene.add(this.group);
  }

  spawn(kind: EnemyKind, chapter: number, at: THREE.Vector3, accent?: string): Enemy {
    const e = new Enemy(kind, chapter, accent, this.physics, this.effects, this.audio, this.hooks, (from, dir, speed, dmg, color) => this.fireBolt(from, dir, speed, dmg, color));
    e.pos.copy(at);
    e.addTo(this.group);
    this.enemies.push(e);
    return e;
  }

  /** 敌人间简单分离 */
  private separate(dt: number): void {
    const list = this.enemies;
    // 玩家推离
    for (const a of list) {
      if (!a.alive) continue;
      const dx = a.pos.x - this.player.pos.x;
      const dz = a.pos.z - this.player.pos.z;
      const r = a.radius + 0.5;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = ((r - d) / d) * Math.min(1, dt * 14);
        a.pos.x += dx * push; a.pos.z += dz * push;
      }
    }
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (!a.alive) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const r = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = ((r - d) / d) * 0.5 * Math.min(1, dt * 12);
          a.pos.x -= dx * push; a.pos.z -= dz * push;
          b.pos.x += dx * push; b.pos.z += dz * push;
        }
      }
    }
  }

  update(dt: number, time: number): void {
    this.separate(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]!;
      const active = e.update(dt, this.player, this.enemies, time);
      if (!active) {
        e.removeFrom(this.group);
        this.enemies.splice(i, 1);
      }
    }
    // 敌方弹幕
    for (const bolt of this.bolts) {
      if (!bolt.alive) continue;
      bolt.life -= dt;
      const step = bolt.vel.clone().multiplyScalar(dt);
      const dist = step.length();
      const dir = step.clone().normalize();
      // 命中玩家（胶囊距离近似）
      const pc = this.player.pos.clone(); pc.y += this.player === null ? 0 : 1;
      const eye = this.player.eyePosition;
      const closest = this.closestPointOnSegment(bolt.pos, bolt.pos.clone().add(step), eye);
      let hitPlayer = closest.distanceTo(eye) < 0.45;
      void pc;
      // 命中世界
      const worldHit = this.physics.raycast(bolt.pos, dir, dist);
      if (hitPlayer || worldHit || bolt.life <= 0) {
        if (hitPlayer) {
          this.player.damage(bolt.damage);
          this.hooks.onPlayerDamaged(bolt.damage, bolt.pos);
          this.audio.hurt();
          this.effects.spark(eye, dir.clone().negate(), '#ff5c5c', 6, 3);
        } else if (worldHit) {
          this.effects.spark(worldHit.point, worldHit.normal, '#ffb08a', 4, 2.5);
        }
        bolt.alive = false;
        bolt.mesh.visible = false;
        continue;
      }
      bolt.pos.add(step);
      bolt.mesh.position.copy(bolt.pos);
    }
  }

  private closestPointOnSegment(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3): THREE.Vector3 {
    const ab = b.clone().sub(a);
    const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-8), 0, 1);
    return a.clone().addScaledVector(ab, t);
  }

  private fireBolt(from: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number, color: string): void {
    let bolt = this.bolts.find((x) => !x.alive);
    if (!bolt) {
      const mesh = new THREE.Mesh(this.boltGeo, new THREE.MeshBasicMaterial({ color }));
      mesh.frustumCulled = false;
      this.group.add(mesh);
      bolt = { alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), damage: 0, mesh, life: 0 };
      this.bolts.push(bolt);
    }
    (bolt.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    bolt.alive = true;
    bolt.pos.copy(from);
    bolt.vel.copy(dir).multiplyScalar(speed);
    bolt.damage = damage;
    bolt.life = 3.5;
    bolt.mesh.visible = true;
  }

  /** 当前存活敌人数（不含尸体） */
  get aliveCount(): number {
    return this.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0);
  }

  clear(): void {
    for (const e of this.enemies) e.removeFrom(this.group);
    this.enemies.length = 0;
    for (const b of this.bolts) { b.alive = false; b.mesh.visible = false; }
  }
}

function raySphere(origin: THREE.Vector3, dir: THREE.Vector3, center: THREE.Vector3, radius: number): { dist: number } | null {
  const oc = origin.clone().sub(center);
  const b = oc.dot(dir);
  const c = oc.lengthSq() - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sqrt = Math.sqrt(disc);
  let t = -b - sqrt;
  if (t < 0) t = -b + sqrt;
  if (t < 0) return null;
  return { dist: t };
}
