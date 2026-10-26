import * as THREE from 'three';

/**
 * 碰撞与射线：静态世界用 AABB 集合表达（与地图生成器同步写入），
 * 玩家/敌人用轴分离滑动碰撞；射击用 Ray-AABB slab 检测。
 */

export interface AABB { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }

export interface RayHit {
  dist: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

const _v1 = new THREE.Vector3();

export class Physics {
  boxes: AABB[] = [];
  /** 竞技场边界（含内墙） */
  bounds = { minX: -45, maxX: 45, minZ: -45, maxZ: 45 };
  /** 地面高度（当前地图均为平地 y=0，平台另行添加碰撞箱） */
  gravity = 22;

  clear(): void { this.boxes.length = 0; }

  addBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    this.boxes.push({ minX, minY, minZ, maxX, maxY, maxZ });
  }

  addCenterBox(cx: number, cy: number, cz: number, w: number, h: number, d: number): void {
    this.addBox(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2);
  }

  // ----------------------------------------------------------
  // AABB 玩家移动（轴分离 + 滑动）
  // pos = 脚底中心；half = 半宽；height = 身高
  // 返回是否着地
  // ----------------------------------------------------------
  move(pos: THREE.Vector3, vel: THREE.Vector3, half: number, height: number, dt: number): boolean {
    let onGround = false;

    // Y 轴
    pos.y += vel.y * dt;
    if (pos.y <= 0) { pos.y = 0; vel.y = 0; onGround = true; }
    for (const b of this.boxes) {
      if (!this.overlapXZ(pos, half, b)) continue;
      // 从上方落到箱顶
      if (vel.y <= 0 && pos.y <= b.maxY && pos.y > b.maxY - 0.6 && pos.y + height > b.minY) {
        pos.y = b.maxY; vel.y = 0; onGround = true;
      } else if (vel.y > 0 && pos.y + height > b.minY && pos.y + height < b.minY + 0.5 && pos.y < b.maxY) {
        pos.y = b.minY - height; vel.y = 0; // 撞头
      }
    }

    // X 轴
    const dx = vel.x * dt;
    if (dx !== 0) {
      pos.x += dx;
      for (const b of this.boxes) {
        if (!this.overlapFull(pos, half, height, b)) continue;
        pos.x = dx > 0 ? b.minX - half - 0.001 : b.maxX + half + 0.001;
      }
    }

    // Z 轴
    const dz = vel.z * dt;
    if (dz !== 0) {
      pos.z += dz;
      for (const b of this.boxes) {
        if (!this.overlapFull(pos, half, height, b)) continue;
        pos.z = dz > 0 ? b.minZ - half - 0.001 : b.maxZ + half + 0.001;
      }
    }

    // 竞技场边界
    pos.x = THREE.MathUtils.clamp(pos.x, this.bounds.minX + half, this.bounds.maxX - half);
    pos.z = THREE.MathUtils.clamp(pos.z, this.bounds.minZ + half, this.bounds.maxZ - half);
    return onGround;
  }

  private overlapXZ(pos: THREE.Vector3, half: number, b: AABB): boolean {
    return pos.x + half > b.minX && pos.x - half < b.maxX
      && pos.z + half > b.minZ && pos.z - half < b.maxZ;
  }

  private overlapFull(pos: THREE.Vector3, half: number, height: number, b: AABB): boolean {
    return pos.x + half > b.minX && pos.x - half < b.maxX
      && pos.z + half > b.minZ && pos.z - half < b.maxZ
      && pos.y + height > b.minY + 0.02 && pos.y < b.maxY - 0.02;
  }

  /** 玩家脚下是否在某箱顶（用于站上平台判定） */
  groundHeightAt(pos: THREE.Vector3, half: number): number {
    let h = 0;
    for (const b of this.boxes) {
      if (!this.overlapXZ(pos, half, b)) continue;
      if (b.maxY <= pos.y + 0.45 && b.maxY > h) h = b.maxY;
    }
    return h;
  }

  // ----------------------------------------------------------
  // Ray vs AABB（slab 法）+ 地面
  // 返回最近命中
  // ----------------------------------------------------------
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
    let best: RayHit | null = null;
    let bestDist = maxDist;

    // 地面 y=0
    if (dir.y < -1e-6) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < bestDist) {
        bestDist = t;
        best = {
          dist: t, point: origin.clone().addScaledVector(dir, t),
          normal: new THREE.Vector3(0, 1, 0),
        };
      }
    }

    for (const b of this.boxes) {
      const hit = rayAABB(origin, dir, b, bestDist);
      if (hit && hit.dist < bestDist) {
        bestDist = hit.dist;
        best = hit;
      }
    }
    return best;
  }

  /** 点是否被遮挡（用于敌人视线） */
  losBlocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    _v1.subVectors(to, from);
    const dist = _v1.length();
    if (dist < 0.001) return false;
    _v1.divideScalar(dist);
    const hit = this.raycast(from, _v1, dist - 0.2);
    return hit !== null;
  }
}

export function rayAABB(origin: THREE.Vector3, dir: THREE.Vector3, b: AABB, maxDist: number): RayHit | null {
  let tmin = 0;
  let tmax = maxDist;
  let axis = -1;
  let sign = 1;

  const process = (o: number, d: number, mn: number, mx: number, ax: number): boolean => {
    if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
    let t1 = (mn - o) / d;
    let t2 = (mx - o) / d;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = ax; sign = s; }
    if (t2 < tmax) tmax = t2;
    return tmin <= tmax;
  };

  if (!process(origin.x, dir.x, b.minX, b.maxX, 0)) return null;
  if (!process(origin.y, dir.y, b.minY, b.maxY, 1)) return null;
  if (!process(origin.z, dir.z, b.minZ, b.maxZ, 2)) return null;

  if (tmin < 0 || tmin > maxDist) return null;
  const point = origin.clone().addScaledVector(dir, tmin);
  const normal = new THREE.Vector3();
  if (axis === 0) normal.x = sign;
  else if (axis === 1) normal.y = sign;
  else if (axis === 2) normal.z = sign;
  else normal.set(0, 1, 0); // 从内部发出，默认向上
  return { dist: tmin, point, normal };
}
