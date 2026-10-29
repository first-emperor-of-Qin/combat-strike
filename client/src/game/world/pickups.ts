import * as THREE from 'three';

/**
 * 金币拾取系统：击杀掉落金币（旋转发光体），靠近自动磁吸收集。
 * 养成系核心反馈 —— 爆金 → 拾取 → 升级强化。
 */

interface Pickup {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  value: number;
  mesh: THREE.Mesh;
  life: number;
  magnetizing: boolean;
}

const MAX_PICKUPS = 80;
const MAGNET_RADIUS = 3.2;
const MAGNET_SPEED = 14;

export class Pickups {
  private pickups: Pickup[] = [];
  private group = new THREE.Group();
  private geo: THREE.BufferGeometry;
  private mat: THREE.MeshBasicMaterial;

  onCollect?: (totalValue: number) => void;

  constructor(private scene: THREE.Scene, private audio: { uiClick(): void; purchase(): void }) {
    // 八面体金币
    this.geo = new THREE.OctahedronGeometry(0.16);
    this.mat = new THREE.MeshBasicMaterial({ color: '#ffd75c' });
    scene.add(this.group);
  }

  /** 击杀掉落（大额掉大个头） */
  drop(pos: THREE.Vector3, value: number, isBoss = false): void {
    const count = isBoss ? 10 : value >= 10 ? 5 : value >= 4 ? 3 : 1;
    const per = Math.max(1, Math.round(value / count));
    for (let i = 0; i < count; i++) {
      const p = this.alloc(isBoss);
      if (!p) return;
      p.alive = true;
      p.value = per;
      p.pos.copy(pos).setY(0.6);
      p.pos.x += (Math.random() - 0.5) * 0.8;
      p.pos.z += (Math.random() - 0.5) * 0.8;
      // 弹跳抛出
      p.vel.set((Math.random() - 0.5) * 3.2, 2.4 + Math.random() * 1.8, (Math.random() - 0.5) * 3.2);
      p.life = 14;
      p.magnetizing = false;
      p.mesh.visible = true;
      p.mesh.position.copy(p.pos);
    }
  }

  private alloc(isBoss: boolean): Pickup | null {
    let p = this.pickups.find((x) => !x.alive);
    if (!p) {
      if (this.pickups.length >= MAX_PICKUPS) return null;
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      p = { alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), value: 1, mesh, life: 0, magnetizing: false };
      this.pickups.push(p);
    }
    p.mesh.scale.setScalar(isBoss ? 2.2 : 1);
    return p;
  }

  update(dt: number, playerPos: THREE.Vector3): void {
    const t = performance.now() * 0.003;
    let collectedThisFrame = 0;
    for (const p of this.pickups) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; p.mesh.visible = false; continue; }

      // 磁吸：进入半径后飞向玩家
      const pc = playerPos.clone().setY(playerPos.y + 0.9);
      const d = p.pos.distanceTo(pc);
      if (!p.magnetizing && d < MAGNET_RADIUS) p.magnetizing = true;
      if (p.magnetizing) {
        const dir = pc.clone().sub(p.pos).normalize();
        p.vel.addScaledVector(dir, MAGNET_SPEED * dt * 2.2);
        p.vel.multiplyScalar(1 - Math.min(1, dt * 2));
      } else {
        // 物理：重力 + 地面反弹
        p.vel.y -= 16 * dt;
        if (p.pos.y < 0.16 && p.vel.y < 0) {
          p.pos.y = 0.16;
          p.vel.y *= -0.42;
          p.vel.x *= 0.72;
          p.vel.z *= 0.72;
        }
      }
      p.pos.addScaledVector(p.vel, dt);

      // 收集
      if (d < 0.85) {
        p.alive = false;
        p.mesh.visible = false;
        collectedThisFrame += p.value;
        continue;
      }

      // 视觉：旋转 + 上下浮动 + 快消失时闪烁
      p.mesh.position.copy(p.pos);
      p.mesh.position.y += Math.sin(t * 2 + p.value) * 0.05;
      p.mesh.rotation.y = t * 2.2;
      p.mesh.rotation.x = t * 0.9;
      p.mesh.visible = p.life > 3 || Math.sin(t * 18) > -0.2;
    }
    if (collectedThisFrame > 0) {
      this.audio.uiClick();
      this.onCollect?.(collectedThisFrame);
    }
  }

  clear(): void {
    for (const p of this.pickups) { p.alive = false; p.mesh.visible = false; }
  }

  /** 结算时自动吸收全场剩余金币 */
  flushAll(): number {
    let total = 0;
    for (const p of this.pickups) {
      if (p.alive) { total += p.value; p.alive = false; p.mesh.visible = false; }
    }
    if (total > 0) this.onCollect?.(total);
    return total;
  }
}
