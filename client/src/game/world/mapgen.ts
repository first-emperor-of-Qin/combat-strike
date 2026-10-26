import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ChapterDef } from '@combat-strike/shared';
import type { Physics } from './physics.js';

/**
 * 程序化章节地图：以种子随机生成对称竞技场（掩体/高台/立柱/主题装饰），
 * 几何体按材质合并以控制 draw call，碰撞箱同步写入 Physics。
 */

export interface MapData {
  group: THREE.Group;
  spawnPoints: THREE.Vector3[];
  playerStart: THREE.Vector3;
  halfSize: number;
  dispose(): void;
}

// 可复现随机
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface KindMaterial { mesh: THREE.Mesh; geoms: THREE.BufferGeometry[] }

const HALF = 44;

export function buildChapterMap(chapter: ChapterDef, physics: Physics, quality: 'low' | 'medium' | 'high'): MapData {
  const rng = mulberry32(chapter.id * 7919 + 13);
  const group = new THREE.Group();
  physics.clear();
  physics.bounds = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };

  const color = new THREE.Color(chapter.wallColor);
  const gcolor = new THREE.Color(chapter.groundColor);
  const accent = new THREE.Color(chapter.accentColor);

  // ---- 材质 ----
  const matGround = new THREE.MeshStandardMaterial({ color: gcolor, roughness: 0.92, metalness: 0.05 });
  const matWall = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.15 });
  const matCrate = new THREE.MeshStandardMaterial({
    color: color.clone().offsetHSL(0, 0.02, 0.06), roughness: 0.7, metalness: 0.25,
  });
  const matAccent = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 1.6, roughness: 0.4,
  });

  const kinds: Record<string, KindMaterial> = {};
  const kind = (m: THREE.Material): KindMaterial => {
    const key = m.uuid;
    if (!kinds[key]) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
      mesh.castShadow = quality !== 'low';
      mesh.receiveShadow = true;
      group.add(mesh);
      kinds[key] = { mesh, geoms: [] };
    }
    return kinds[key]!;
  };

  const box = (
    m: THREE.Material, cx: number, cy: number, cz: number,
    w: number, h: number, d: number, rotY = 0, collide = true,
  ): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(cx, cy, cz);
    if (rotY !== 0) {
      g.rotateY(rotY);
      // 旋转后重算 AABB（本地图内旋转均接近 0 或 π/2，简单处理为外接盒）
    }
    kind(m).geoms.push(g);
    if (collide) {
      if (rotY === 0) {
        physics.addCenterBox(cx, cy, cz, w, h, d);
      } else {
        const s = Math.abs(Math.cos(rotY)) * w + Math.abs(Math.sin(rotY)) * d;
        const t = Math.abs(Math.sin(rotY)) * w + Math.abs(Math.cos(rotY)) * d;
        physics.addCenterBox(cx, cy, cz, s, h, t);
      }
    }
  };

  // ---- 地面 ----
  const groundGeo = new THREE.BoxGeometry(HALF * 2 + 8, 0.5, HALF * 2 + 8);
  groundGeo.translate(0, -0.25, 0);
  kind(matGround).geoms.push(groundGeo);
  const groundMesh = kind(matGround).mesh;
  groundMesh.receiveShadow = true;

  // ---- 围墙（四面，留出视觉上开放的天际） ----
  const wallH = 7;
  const wallT = 2;
  const off = HALF + wallT / 2;
  box(matWall, 0, wallH / 2, -off, HALF * 2 + wallT * 2, wallH, wallT);
  box(matWall, 0, wallH / 2, off, HALF * 2 + wallT * 2, wallH, wallT);
  box(matWall, -off, wallH / 2, 0, wallT, wallH, HALF * 2 + wallT * 2);
  box(matWall, off, wallH / 2, 0, wallT, wallH, HALF * 2 + wallT * 2);

  // 墙顶霓虹压条（发光饰带）
  for (const [x, z, w, d] of [[0, -off + wallT / 2 + 0.05, HALF * 2, 0.12], [0, off - wallT / 2 - 0.05, HALF * 2, 0.12]] as const) {
    box(matAccent, x, wallH - 0.3, z, w, 0.18, d, 0, false);
  }
  for (const [x, z, d] of [[-off + wallT / 2 + 0.05, 0, HALF * 2], [off - wallT / 2 - 0.05, 0, HALF * 2]] as const) {
    box(matAccent, x, wallH - 0.3, z, 0.12, 0.18, d, 0, false);
  }

  // ---- 中心结构（掩体核心） ----
  box(matCrate, 0, 1.1, 0, 7, 2.2, 7);
  box(matWall, 0, 2.5, 0, 3.2, 0.5, 3.2);
  // 中心四向矮墙
  box(matCrate, 0, 0.8, -6.5, 9, 1.6, 1);
  box(matCrate, 0, 0.8, 6.5, 9, 1.6, 1);
  box(matCrate, -6.5, 0.8, 0, 1, 1.6, 9);
  box(matCrate, 6.5, 0.8, 0, 1, 1.6, 9);

  // ---- 对称掩体群（180° 旋转对称，公平性） ----
  const cluster = (bx: number, bz: number): void => {
    for (const [sx, sz] of [[bx, bz], [-bx, -bz]] as const) {
      const pick = rng();
      if (pick < 0.35) {
        // 板墙
        const w = 4 + rng() * 3, h = 2 + rng() * 0.8;
        box(matCrate, sx, h / 2, sz, w, h, 0.9, rng() < 0.5 ? 0 : Math.PI / 2);
      } else if (pick < 0.7) {
        // 箱堆
        const n = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const s = 1.2 + rng() * 0.6;
          box(matCrate, sx + (rng() - 0.5) * 2.2, s / 2 + i * 0.02, sz + (rng() - 0.5) * 2.2, s, s, s, rng() * 0.5);
        }
      } else {
        // 高台 + 坡道
        const h = 2.4, s = 5 + rng() * 2;
        box(matCrate, sx, h / 2, sz, s, h, s);
        box(matCrate, sx + s / 2 + 1.6, h / 4, sz, 3, h / 2, s * 0.7);
      }
    }
  };

  const spots: Array<[number, number]> = [
    [14, 10], [24, -18], [-15, 14], [-26, -8], [8, -26], [-9, 28], [30, 22], [-30, -24],
  ];
  for (const [x, z] of spots) cluster(x, z);

  // ---- 四角立柱塔 ----
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const x = sx * 36, z = sz * 36;
    box(matWall, x, 3, z, 3, 6, 3);
    box(matAccent, x, 6.2, z, 3.2, 0.25, 3.2, 0, false);
  }

  // ---- 主题装饰 ----
  const themeExtras = (theme: ChapterDef['theme']): void => {
    switch (theme) {
      case 'neon': {
        // 建筑剪影 + 发光窗带
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * Math.PI * 2;
          const r = 47 + rng() * 10;
          const h = 10 + rng() * 22;
          const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
          box(matWall, x, h / 2, z, 6 + rng() * 6, h, 6 + rng() * 6, 0, false);
          box(matAccent, x, 2 + rng() * h, z, 0.3, 0.3, 6, 0, false);
        }
        matGround.roughness = 0.35; matGround.metalness = 0.5; // 雨夜湿地面反光
        break;
      }
      case 'polar': {
        for (let i = 0; i < 10; i++) {
          const s = 2 + rng() * 3;
          const g = new THREE.SphereGeometry(s, 10, 8);
          g.scale(1, 0.4, 1);
          g.translate((rng() - 0.5) * 70, s * 0.1, (rng() - 0.5) * 70);
          kind(matCrate).geoms.push(g);
        }
        break;
      }
      case 'furnace': {
        // 熔岩沟（发光条）
        for (let i = 0; i < 6; i++) {
          const z = -30 + i * 12;
          box(matAccent, (rng() - 0.5) * 30, 0.06, z, 10 + rng() * 14, 0.1, 2.4, 0, false);
        }
        break;
      }
      case 'void': {
        // 悬浮水晶
        const crystalMat = new THREE.MeshStandardMaterial({
          color: accent, emissive: accent, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.4,
        });
        for (let i = 0; i < 10; i++) {
          const g = new THREE.OctahedronGeometry(0.9 + rng() * 1.6);
          g.translate((rng() - 0.5) * 60, 3 + rng() * 8, (rng() - 0.5) * 60);
          kind(crystalMat).geoms.push(g);
        }
        break;
      }
      case 'orbital': {
        // 天线与管线
        const pipe = new THREE.MeshStandardMaterial({ color: color.clone().offsetHSL(0, 0, 0.1), roughness: 0.5, metalness: 0.7 });
        for (let i = 0; i < 8; i++) {
          const g = new THREE.CylinderGeometry(0.4, 0.4, 9, 10);
          g.translate(-30 + i * 8.5, 4.5, (rng() > 0.5 ? 41 : -41));
          kind(pipe).geoms.push(g);
        }
        break;
      }
      case 'desert': {
        // 沙袋弧墙
        for (let i = 0; i < 5; i++) {
          const x = (rng() - 0.5) * 50, z = (rng() - 0.5) * 50;
          for (let j = 0; j < 4; j++) {
            box(matCrate, x + Math.cos(j) * 2, 0.5 + (j % 2) * 0.7, z + Math.sin(j) * 2, 1.8, 0.7, 0.9, j * 0.5);
          }
        }
        break;
      }
      case 'mine': {
        // 矿道支撑架
        const wood = new THREE.MeshStandardMaterial({ color: '#4a3624', roughness: 0.95 });
        for (let i = 0; i < 6; i++) {
          const x = -25 + i * 10;
          box(wood, x, 2.6, 40, 0.8, 5.2, 0.8);
          box(wood, x, 2.6, -40, 0.8, 5.2, 0.8);
          box(wood, x, 5.3, 40, 12, 0.7, 1, 0, false);
          box(wood, x, 5.3, -40, 12, 0.7, 1, 0, false);
        }
        break;
      }
      case 'citadel': {
        // 能量方尖碑
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const x = Math.cos(ang) * 30, z = Math.sin(ang) * 30;
          box(matWall, x, 4, z, 2.4, 8, 2.4);
          box(matAccent, x, 8.4, z, 1.6, 1.2, 1.6, 0, false);
        }
        break;
      }
      default: break;
    }
  };
  themeExtras(chapter.theme);

  // ---- 合并几何体 ----
  const disposables: THREE.BufferGeometry[] = [];
  for (const k of Object.values(kinds)) {
    if (k.geoms.length === 0) continue;
    const merged = mergeGeometries(k.geoms, false);
    if (merged) {
      k.mesh.geometry.dispose();
      k.mesh.geometry = merged;
      disposables.push(merged);
    }
    for (const g of k.geoms) g.dispose();
    k.geoms.length = 0;
  }

  // ---- 光照 ----
  // 半球星光：章节底色偏暗，向白提亮以保证阴影区可读
  const hemiSky = new THREE.Color(chapter.skyColor).lerp(new THREE.Color('#ffffff'), 0.55);
  const hemiGround = new THREE.Color(chapter.groundColor).lerp(new THREE.Color('#c8c2b8'), 0.35);
  const hemi = new THREE.HemisphereLight(hemiSky, hemiGround, chapter.ambientIntensity * 2.6);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(new THREE.Color(chapter.sunColor), chapter.sunIntensity * 1.35);
  sun.position.set(30, 50, 20);
  if (quality !== 'low') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0004;
  }
  const fill = new THREE.DirectionalLight(new THREE.Color(chapter.accentColor), 1.1);
  fill.position.set(-26, 34, -18);
  group.add(fill);

  group.add(sun);
  group.add(sun.target);

  // 四角点缀灯
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const pl = new THREE.PointLight(accent, 22, 34, 1.8);
    pl.position.set(sx * 33, 4.4, sz * 33);
    group.add(pl);
  }

  // ---- 出生点（场边 10 个） ----
  const spawnPoints: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + 0.3;
    const r = 36 + rng() * 4;
    spawnPoints.push(new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r));
  }

  return {
    group,
    spawnPoints,
    playerStart: new THREE.Vector3(0, 0, 16),
    halfSize: HALF,
    dispose(): void {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const m = mesh.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
      for (const g of disposables) g.dispose();
    },
  };
}
