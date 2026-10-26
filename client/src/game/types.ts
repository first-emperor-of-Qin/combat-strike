import * as THREE from 'three';

/** 敌人命中接口（weapons 与 enemies 解耦） */
export interface EnemyLike {
  readonly id: number;
  readonly kind: string;
  readonly name: string;
  alive: boolean;
  pos: THREE.Vector3;          // 脚底中心
  radius: number;
  height: number;
  isBoss: boolean;
  /** 射线命中测试：返回距离/是否爆头/命中点 */
  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { dist: number; isHead: boolean; point: THREE.Vector3 } | null;
  /** 受击，返回是否死亡 */
  applyDamage(amount: number, isHead: boolean): boolean;
}

export interface HudHooks {
  setHp(hp: number, maxHp: number): void;
  setAmmo(mag: number, reserve: number, name: string, reloading: boolean): void;
  setWaveInfo(text: string, sub: string, progress: number): void;
  bossBar(name: string | null, hpFrac: number): void;
  hitmarker(headshot: boolean): void;
  killfeed(text: string): void;
  damageNumber(worldPos: THREE.Vector3, amount: number, headshot: boolean): void;
  damageDirection(angle: number): void;
  vignette(intensity: number): void;
  crosshairSpread(spreadPx: number): void;
  announce(text: string, sub?: string): void;
  gold(amount: number): void;
}
