import * as THREE from 'three';
import type { Physics } from '../world/physics.js';
import type { Input } from '../core/input.js';

/**
 * 第一人称玩家控制器：加速度移动 / 跳跃（含土狼时间与缓冲）/ 蹲伏 /
 * 冲刺 / 鼠标视角（含开火后坐注入）/ 相机呼吸与落地颠簸。
 */

const WALK = 5.4;
const SPRINT = 8.2;
const CROUCH = 2.7;
const ACCEL_GROUND = 60;
const ACCEL_AIR = 18;
const JUMP_V = 7.6;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.05;
const HALF = 0.35;
const HEIGHT_STAND = 1.75;
const HEIGHT_CROUCH = 1.15;

export class Player {
  pos = new THREE.Vector3(0, 0, 16);   // 脚底中心
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = true;
  crouching = false;
  sprinting = false;
  /** 移动速度归一化（0-1，供视图模型 bob） */
  moveNorm = 0;
  sprintK = 0;

  maxHp = 100;
  hp = 100;

  // 外部注入：武器移动倍率
  moveMult = 1;

  // 后坐视角偏移（武器系统写入，自动回落）
  recoilPitch = 0;
  recoilYaw = 0;

  private eyeH = EYE_STAND;
  private coyote = 0;
  private jumpBuffer = 0;
  private landK = 0;
  private bobT = 0;
  private stepT = 0;
  private camShake = 0;

  onFootstep?: () => void;
  onLand?: (hard: boolean) => void;

  get eyePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeH, this.pos.z);
  }

  spawn(at: THREE.Vector3, hp: number): void {
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.hp = hp;
    this.maxHp = hp;
    this.crouching = false;
    this.recoilPitch = 0; this.recoilYaw = 0;
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
  }

  applyRecoil(pitch: number, yaw: number): void {
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
  }

  addShake(amount: number): void {
    this.camShake = Math.min(0.5, this.camShake + amount);
  }

  update(dt: number, input: Input, physics: Physics): void {
    // ---- 视角 ----
    this.look(input.mouseDX, input.mouseDY);
    // 后坐回落（指数 + 拉回）
    this.pitch += this.recoilPitch * dt * 9;
    this.yaw += this.recoilYaw * dt * 9;
    const recover = Math.pow(0.0016, dt);
    this.recoilPitch *= recover;
    this.recoilYaw *= recover;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);

    // ---- 蹲伏 ----
    const wantCrouch = input.down('ControlLeft') || input.down('KeyC');
    this.crouching = wantCrouch || !this.canStand(physics);
    const targetH = this.crouching ? HEIGHT_CROUCH : HEIGHT_STAND;

    // ---- 冲刺 ----
    this.sprinting = input.down('ShiftLeft') && !this.crouching && this.moveInput(input) !== 0;

    // ---- 移动输入（相机相对） ----
    const wish = this.wishDir(input);
    const speed = (this.crouching ? CROUCH : this.sprinting ? SPRINT : WALK) * this.moveMult;
    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;

    // 水平速度趋近目标
    const targetVx = wish.x * speed;
    const targetVz = wish.z * speed;
    this.vel.x += (targetVx - this.vel.x) * Math.min(1, accel * dt / Math.max(speed, 0.001) * (this.onGround ? 1.4 : 0.5));
    this.vel.z += (targetVz - this.vel.z) * Math.min(1, accel * dt / Math.max(speed, 0.001) * (this.onGround ? 1.4 : 0.5));
    if (wish.lengthSq() === 0 && this.onGround) {
      const damp = Math.pow(0.0001, dt);
      this.vel.x *= damp; this.vel.z *= damp;
    }

    // ---- 跳跃 ----
    if (input.down('Space')) this.jumpBuffer = 0.14;
    this.jumpBuffer -= dt;
    this.coyote = this.onGround ? 0.12 : this.coyote - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_V;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }

    // ---- 重力 + 碰撞 ----
    this.vel.y -= physics.gravity * dt;
    const wasAir = !this.onGround;
    const fallSpeed = -this.vel.y;
    this.onGround = physics.move(this.pos, this.vel, HALF, targetH, dt);
    // 站上箱顶修正（move 只处理下落穿越，站立时贴合表面）
    if (this.onGround && this.vel.y <= 0) {
      const gh = physics.groundHeightAt(this.pos, HALF);
      if (gh > 0 && this.pos.y <= gh + 0.05 && this.pos.y >= gh - 0.3) this.pos.y = gh;
    }
    if (wasAir && this.onGround && fallSpeed > 4) {
      this.landK = Math.min(1, fallSpeed / 14);
      this.onLand?.(fallSpeed > 12);
      if (fallSpeed > 16) this.damage(Math.round((fallSpeed - 16) * 4));
    }

    // ---- 脚步声 ----
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.moveNorm = THREE.MathUtils.clamp(hSpeed / SPRINT, 0, 1);
    this.sprintK = this.sprinting ? 1 : 0;
    if (this.onGround && hSpeed > 1.2) {
      this.stepT += dt * hSpeed;
      if (this.stepT > 2.6) { this.stepT = 0; this.onFootstep?.(); }
    }

    // ---- 眼高平滑 ----
    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eyeH += (targetEye - this.eyeH) * Math.min(1, dt * 10);
    if (this.landK > 0) this.landK = Math.max(0, this.landK - dt * 3.5);
    if (this.camShake > 0) this.camShake = Math.max(0, this.camShake - dt * 1.8);

    this.bobT += dt * hSpeed * 1.4;
  }

  /** 应用相机姿态（含 bob/shake/后坐） */
  applyToCamera(camera: THREE.PerspectiveCamera): void {
    const bobY = Math.sin(this.bobT * 2) * 0.018 * this.moveNorm * (this.onGround ? 1 : 0);
    const bobX = Math.cos(this.bobT) * 0.012 * this.moveNorm * (this.onGround ? 1 : 0);
    const shakeX = (Math.random() - 0.5) * this.camShake * 0.05;
    const shakeY = (Math.random() - 0.5) * this.camShake * 0.05;
    camera.position.set(
      this.pos.x + bobX + shakeX,
      this.pos.y + this.eyeH - this.landK * 0.22 + bobY + shakeY,
      this.pos.z,
    );
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw + this.recoilYaw;
    camera.rotation.x = this.pitch + this.recoilPitch + (this.onGround ? 0 : 0);
    camera.rotation.z = Math.sin(this.bobT) * 0.004 * this.moveNorm;
  }

  damage(amount: number): void {
    if (amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.camShake = Math.min(0.5, this.camShake + 0.12);
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  private wishDir(input: Input): THREE.Vector3 {
    const f = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const s = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    if (f === 0 && s === 0) return new THREE.Vector3();
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // 相机前向 = (-sin, -cos)（yaw=0 面向 -Z）
    const dir = new THREE.Vector3(-sin * f + cos * s, 0, -cos * f - sin * s);
    return dir.normalize();
  }

  private moveInput(input: Input): number {
    return ((input.down('KeyW') ? 1 : 0) + (input.down('KeyA') ? 1 : 0)
      + (input.down('KeyS') ? 1 : 0) + (input.down('KeyD') ? 1 : 0));
  }

  private canStand(physics: Physics): boolean {
    if (this.crouching === false && this.eyeH > EYE_STAND - 0.05) return true;
    // 简化：头顶检测（略）
    void physics;
    return true;
  }
}
