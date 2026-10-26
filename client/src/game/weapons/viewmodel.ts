import * as THREE from 'three';
import type { WeaponDef, WeaponClass } from '@combat-strike/shared';

/**
 * 第一人称武器模型（程序化建模）+ 动画装配：
 * 呼吸摆动 / 走路晃动 / 开火后坐 / 换弹动画（弹匣分离） / 切枪升降 / ADS 过渡。
 */

const MAT_GUNMETAL = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: '#565e6a', roughness: 0.4, metalness: 0.75 });
const MAT_DARK = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: '#33373f', roughness: 0.55, metalness: 0.5 });
const MAT_GRIP = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: '#54473a', roughness: 0.85, metalness: 0.1 });
const MAT_ACCENT = (color: string, emissive = 1.2): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.35, metalness: 0.4 });

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
function cyl(r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = Math.PI / 2): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  return m;
}

/** 按类别构建武器模型，返回 group（-Z 指向前方）与枪口锚点 */
function buildModel(def: WeaponDef): { group: THREE.Group; muzzle: THREE.Object3D; mag: THREE.Object3D | null } {
  const g = new THREE.Group();
  const metal = MAT_GUNMETAL();
  const dark = MAT_DARK();
  const grip = MAT_GRIP();
  const accent = MAT_ACCENT(def.accent, def.class === 'energy' ? 2.4 : 1.6);

  const muzzle = new THREE.Object3D();
  let mag: THREE.Object3D | null = null;
  let muzzleZ = -0.55;

  const buildReceiver = (len: number, h: number, w: number, z0: number): void => {
    g.add(box(w, h, len, metal, 0, 0, z0));
    g.add(box(w * 0.96, h * 0.5, len * 0.3, dark, 0, h * 0.32, z0 + len * 0.22));
  };
  const buildGripStock = (zGrip: number, withStock: boolean): void => {
    g.add(box(0.055, 0.16, 0.07, grip, 0, -0.11, zGrip, 0.35));
    if (withStock) g.add(box(0.06, 0.1, 0.16, grip, 0, -0.015, 0.28));
  };
  const buildSight = (z: number, big = false): void => {
    g.add(box(0.035, big ? 0.05 : 0.03, 0.05, dark, 0, 0.075, z));
    g.add(box(0.03, 0.012, 0.012, accent, 0, big ? 0.105 : 0.095, z - 0.02));
  };
  const buildMagWell = (z: number, h: number, d: number): void => {
    mag = new THREE.Group();
    mag.add(box(0.045, h, d, dark, 0, -h / 2 - 0.02, z));
    mag.add(box(0.05, 0.02, d * 0.9, accent, 0, -h - 0.03, z));
    g.add(mag);
  };
  const buildBarrel = (z0: number, len: number, r: number): void => {
    g.add(cyl(r, len, dark, 0, 0.005, z0 - len / 2));
    g.add(cyl(r * 1.5, 0.05, metal, 0, 0.005, z0 - len + 0.02));
    muzzleZ = z0 - len;
  };

  switch (def.class) {
    case 'pistol': {
      buildReceiver(0.2, 0.09, 0.05, -0.05);
      buildBarrel(0.02, 0.14, 0.018);
      buildGripStock(-0.12, false);
      buildMagWell(-0.13, 0.09, 0.05);
      buildSight(-0.1);
      break;
    }
    case 'smg': {
      buildReceiver(0.32, 0.1, 0.055, -0.08);
      buildBarrel(0.06, 0.2, 0.02);
      buildGripStock(-0.16, true);
      buildMagWell(-0.14, 0.16, 0.06);
      buildSight(-0.16);
      g.add(cyl(0.03, 0.09, dark, 0, -0.005, 0.02));
      break;
    }
    case 'ar': {
      buildReceiver(0.4, 0.11, 0.06, -0.1);
      buildBarrel(0.1, 0.3, 0.021);
      g.add(box(0.07, 0.05, 0.14, dark, 0, 0.02, -0.34)); // 护木
      buildGripStock(-0.18, true);
      buildMagWell(-0.12, 0.17, 0.07);
      buildSight(-0.2, true);
      break;
    }
    case 'shotgun': {
      buildReceiver(0.36, 0.11, 0.065, -0.08);
      buildBarrel(0.06, 0.34, 0.026);
      g.add(cyl(0.024, 0.3, metal, 0, -0.045, -0.2)); // 管状弹仓
      buildGripStock(-0.16, true);
      g.add(box(0.06, 0.05, 0.12, grip, 0, -0.05, -0.24)); // 护木泵
      buildSight(-0.18);
      break;
    }
    case 'dmr': {
      buildReceiver(0.44, 0.11, 0.06, -0.12);
      buildBarrel(0.12, 0.4, 0.02);
      buildGripStock(-0.2, true);
      buildMagWell(-0.14, 0.15, 0.08);
      buildSight(-0.24, true);
      g.add(box(0.035, 0.06, 0.22, dark, 0, 0.11, -0.22)); // 瞄准镜身
      g.add(cyl(0.028, 0.2, metal, 0, 0.11, -0.22));
      break;
    }
    case 'sniper': {
      buildReceiver(0.5, 0.11, 0.06, -0.14);
      buildBarrel(0.14, 0.52, 0.022);
      buildGripStock(-0.22, true);
      buildMagWell(-0.16, 0.13, 0.09);
      g.add(cyl(0.032, 0.26, metal, 0, 0.115, -0.26)); // 高倍镜
      g.add(box(0.02, 0.05, 0.02, dark, 0, 0.09, -0.13));
      g.add(box(0.02, 0.05, 0.02, dark, 0, 0.09, -0.39));
      break;
    }
    case 'lmg': {
      buildReceiver(0.46, 0.13, 0.07, -0.12);
      buildBarrel(0.1, 0.34, 0.025);
      g.add(cyl(0.045, 0.24, dark, 0, -0.1, -0.12)); // 弹链盒
      g.add(box(0.09, 0.14, 0.2, metal, 0, -0.1, -0.1));
      buildGripStock(-0.2, true);
      buildSight(-0.24);
      g.add(box(0.05, 0.06, 0.1, grip, -0.06, -0.06, -0.3, 0, 0, 0.5)); // 前握把
      break;
    }
    case 'energy': {
      buildReceiver(0.4, 0.12, 0.07, -0.1);
      g.add(cyl(0.032, 0.34, metal, 0, 0.01, -0.32));
      g.add(cyl(0.05, 0.06, accent, 0, 0.01, -0.5));
      // 能量导管
      g.add(box(0.02, 0.02, 0.3, accent, 0.042, 0.05, -0.15));
      g.add(box(0.02, 0.02, 0.3, accent, -0.042, 0.05, -0.15));
      g.add(box(0.08, 0.1, 0.14, dark, 0, -0.02, 0.02)); // 核心舱
      const core = box(0.05, 0.05, 0.05, accent, 0, 0.06, 0.04);
      g.add(core);
      buildGripStock(-0.16, true);
      buildMagWell(-0.1, 0.12, 0.06);
      muzzleZ = -0.55;
      break;
    }
    case 'launcher': {
      g.add(cyl(0.07, 0.7, dark, 0, 0.02, -0.2));
      g.add(cyl(0.085, 0.1, metal, 0, 0.02, -0.5));
      g.add(cyl(0.05, 0.3, accent, 0, 0.02, -0.25));
      buildGripStock(-0.05, true);
      g.add(box(0.04, 0.08, 0.14, dark, 0, 0.1, -0.1)); // 瞄具
      muzzleZ = -0.56;
      break;
    }
  }

  muzzle.position.set(0, 0.005, muzzleZ);
  g.add(muzzle);

  // 品级光带
  g.add(box(0.012, 0.012, 0.14, accent, 0.036, 0.01, -0.05));
  g.add(box(0.012, 0.012, 0.14, accent, -0.036, 0.01, -0.05));

  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; }
  });
  return { group: g, muzzle, mag };
}

const HIP_POS = new THREE.Vector3(0.17, -0.15, -0.42);
const ADS_POS = new THREE.Vector3(0, -0.075, -0.22);
const LOWER_POS = new THREE.Vector3(0.12, -0.4, -0.28);

export class Viewmodel {
  private scene: THREE.Scene;
  group = new THREE.Group();

  private current: { group: THREE.Group; muzzle: THREE.Object3D; mag: THREE.Object3D | null } | null = null;
  private def: WeaponDef | null = null;

  // 动画状态
  private adsK = 0;              // 0=腰射 1=机瞄
  private targetAds = 0;
  private recoilPos = new THREE.Vector3();
  private recoilRot = new THREE.Vector3();
  private bobT = 0;
  private swayX = 0; private swayY = 0;
  private reloadP = -1;          // <0 未换弹
  private reloadDur = 1;
  private reloadElapsed = 0;
  private magMesh: THREE.Object3D | null = null;
  private onReloadStage?: (stage: 'out' | 'in' | 'bolt') => void;
  private firedStage = { out: false, in: false, bolt: false };

  private switchT = -1;          // <0 无切枪
  private switchDur = 0.28;
  private switchElapsed = 0;

  // 枪口闪光
  private flash: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private flashT = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.position.copy(HIP_POS);
    scene.add(this.group);

    const flashMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
    this.flash.frustumCulled = false;
    this.group.add(this.flash);
    this.flashLight = new THREE.PointLight('#ffbf70', 0, 3, 2);
    this.group.add(this.flashLight);
  }

  setWeapon(def: WeaponDef): void {
    if (this.current) {
      this.group.remove(this.current.group);
      disposeGroup(this.current.group);
    }
    this.current = buildModel(def);
    this.current.group.scale.setScalar(0.82);
    this.magMesh = this.current.mag;
    this.group.add(this.current.group);
    this.def = def;
    this.reloadP = -1;
    this.switchT = 0; // 抬枪
    this.switchElapsed = 0;
  }

  get weaponDef(): WeaponDef | null { return this.def; }

  setAds(on: boolean): void { this.targetAds = on ? 1 : 0; }

  isAds(): boolean { return this.adsK > 0.6; }

  triggerRecoil(power: number): void {
    this.recoilPos.z += 0.035 * power;
    this.recoilPos.y += 0.008 * power;
    this.recoilRot.x += 0.05 * power;
    this.recoilRot.z += (Math.random() - 0.5) * 0.03 * power;
    // 枪口闪光
    this.flashT = 0.045;
    this.flashLight.intensity = 3 * power;
    const m = this.flash.material as THREE.MeshBasicMaterial;
    m.opacity = 0.9;
    const s = 0.7 + Math.random() * 0.6;
    this.flash.scale.set(s, s, s);
    this.flash.rotation.z = Math.random() * Math.PI;
  }

  playReload(duration: number, onStage?: (stage: 'out' | 'in' | 'bolt') => void): void {
    this.reloadP = 0;
    this.reloadDur = duration;
    this.reloadElapsed = 0;
    this.onReloadStage = onStage;
    this.firedStage = { out: false, in: false, bolt: false };
  }

  isReloading(): boolean { return this.reloadP >= 0; }

  muzzleWorldPos(camera: THREE.Camera): THREE.Vector3 {
    const v = new THREE.Vector3();
    if (this.current) {
      this.current.muzzle.getWorldPosition(v);
      // view 场景与主场景共享相机位姿：viewCamera 原点 = 主相机位置
      v.applyMatrix4(camera.matrixWorld);
    } else {
      v.setFromMatrixPosition(camera.matrixWorld);
    }
    return v;
  }

  update(dt: number, moveSpeedNorm: number, grounded: boolean, mouseDX: number, mouseDY: number, sprintK: number): void {
    if (!this.current) return;
    const def = this.def!;

    // ADS 过渡
    this.adsK += (this.targetAds - this.adsK) * Math.min(1, dt * 12);

    // 换弹
    if (this.reloadP >= 0) {
      this.reloadElapsed += dt;
      this.reloadP = Math.min(1, this.reloadElapsed / this.reloadDur);
      const p = this.reloadP;
      if (!this.firedStage.out && p > 0.18) { this.firedStage.out = true; this.onReloadStage?.('out'); }
      if (!this.firedStage.in && p > 0.62) { this.firedStage.in = true; this.onReloadStage?.('in'); }
      if (!this.firedStage.bolt && p > 0.88) { this.firedStage.bolt = true; this.onReloadStage?.('bolt'); }
      if (p >= 1) this.reloadP = -1;
    }

    // 切枪
    if (this.switchT >= 0) {
      this.switchElapsed += dt;
      if (this.switchElapsed >= this.switchDur) this.switchT = -1;
    }

    // 摆动
    this.swayX += (-mouseDX * 1.6 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (-mouseDY * 1.6 - this.swayY) * Math.min(1, dt * 10);

    // 走路晃动
    const bobAmt = (1 - this.adsK * 0.8) * moveSpeedNorm * (grounded ? 1 : 0.2);
    this.bobT += dt * (6 + sprintK * 5);
    const bobX = Math.cos(this.bobT * 0.5) * 0.012 * bobAmt;
    const bobY = Math.abs(Math.sin(this.bobT * 0.5)) * 0.014 * bobAmt;

    // 后坐恢复
    this.recoilPos.multiplyScalar(1 - Math.min(1, dt * 11));
    this.recoilRot.multiplyScalar(1 - Math.min(1, dt * 9));

    // 位置合成
    const p = this.group.position;
    p.lerpVectors(HIP_POS, ADS_POS, this.adsK);
    p.x += bobX + this.swayX * 0.02;
    p.y += bobY + this.swayY * 0.02 + Math.sin(this.bobT * 0.9) * 0.003 * (1 - this.adsK);
    p.z += this.recoilPos.z;
    p.y += this.recoilPos.y;

    // 姿态合成
    const r = this.group.rotation;
    const reloadRot = this.reloadP >= 0 ? reloadPose(this.reloadP) : 0;
    const lowerK = this.switchT >= 0 ? Math.sin((this.switchElapsed / this.switchDur) * Math.PI) : 0;
    r.x = this.recoilRot.x + reloadRot * 0.9 + lowerK * 0.7 + this.swayY * 0.06;
    r.z = this.recoilRot.z + reloadRot * 0.4 + lowerK * 0.35 + this.swayX * 0.05;
    r.y = this.swayX * 0.08;

    // 弹匣动画
    if (this.magMesh) {
      const p2 = this.reloadP;
      if (p2 >= 0) {
        // 0.18-0.45 掉出；0.62-0.8 回位
        let magOff = 0;
        if (p2 > 0.18 && p2 < 0.62) magOff = Math.min(1, (p2 - 0.18) / 0.16) * 0.22;
        else if (p2 >= 0.62) magOff = Math.max(0, 1 - (p2 - 0.62) / 0.16) * 0.22;
        this.magMesh.position.y = -magOff;
        this.magMesh.visible = !(p2 > 0.34 && p2 < 0.55);
      } else {
        this.magMesh.position.y = 0;
        this.magMesh.visible = true;
      }
    }

    // 枪口闪光衰减
    if (this.flashT > 0) {
      this.flashT -= dt;
      const m = this.flash.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, this.flashT / 0.045) * 0.9;
      this.flashLight.intensity *= 1 - Math.min(1, dt * 30);
      if (this.flashT <= 0) { m.opacity = 0; this.flashLight.intensity = 0; }
    }

    // 能量武器呼吸光
    if (def.class === 'energy') {
      const t = performance.now() * 0.002;
      this.group.children.forEach((c) => {
        const mesh = c as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat && mat.emissive && mat.emissiveIntensity > 1.5) {
          mat.emissiveIntensity = 2.0 + Math.sin(t) * 0.5;
        }
      });
    }

    // ADS 时移动到中心
    void this.scene;
  }
}

function reloadPose(p: number): number {
  // 下倾-回位曲线
  if (p < 0.2) return (p / 0.2) * 0.5;
  if (p < 0.75) return 0.5 + Math.sin((p - 0.2) / 0.55 * Math.PI) * 0.08;
  return 0.5 * (1 - (p - 0.75) / 0.25);
}

function disposeGroup(g: THREE.Group): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
      else mat.dispose();
    }
  });
}
