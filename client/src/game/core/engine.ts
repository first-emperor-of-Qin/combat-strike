import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Settings } from '../../config.js';

/**
 * 渲染引擎：WebGL 渲染器 + ACES 色调映射 + Bloom 后处理。
 * 主场景渲染游戏世界；viewScene 单独渲染第一人称武器（避免穿模、独立 FOV）。
 */
export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  viewScene = new THREE.Scene();
  viewCamera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;

  private canvas: HTMLCanvasElement;
  private quality: 'low' | 'medium' | 'high' = 'high';
  private fov = 78;

  constructor(canvas: HTMLCanvasElement, settings: Settings) {
    this.canvas = canvas;
    this.quality = settings.quality;
    this.fov = settings.fov;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;

    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.08, 400);
    this.viewCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);

    // 武器层独立光照（主场景灯光不跨场景）
    const vHemi = new THREE.HemisphereLight('#cfd6e0', '#3a3a40', 1.15);
    const vKey = new THREE.DirectionalLight('#fff2df', 2.4);
    vKey.position.set(0.6, 1.2, 0.5);
    const vRim = new THREE.DirectionalLight('#8fb4ff', 0.55);
    vRim.position.set(-0.9, 0.3, -0.7);
    const vCam = new THREE.DirectionalLight('#ffffff', 1.5); // 相机方向补光，保证枪身正面可读
    vCam.position.set(0, 0.25, 1);
    this.viewScene.add(vHemi, vKey, vRim, vCam);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.55, 0.82);
    if (settings.quality === 'high') this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private pixelRatio(): number {
    if (this.quality === 'low') return Math.min(window.devicePixelRatio, 1);
    if (this.quality === 'medium') return Math.min(window.devicePixelRatio, 1.35);
    return Math.min(window.devicePixelRatio, 2);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = aspect;
    this.viewCamera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }

  applySettings(settings: Settings): void {
    const rebuild = settings.quality !== this.quality;
    this.quality = settings.quality;
    this.fov = settings.fov;
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.shadowMap.enabled = settings.quality !== 'low';
    if (rebuild) this.resize();
  }

  /** 每帧渲染：主场景 + 武器层 */
  render(): void {
    this.renderer.clear();
    this.composer.render();

    // 第一人称武器层（深度独立，永远在最前）
    const vl = this.viewCamera.layers;
    vl.set(0);
    this.renderer.clearDepth();
    this.renderer.render(this.viewScene, this.viewCamera);
  }

  /** 更新武器层 FOV（开镜时轻微变化） */
  setViewFov(fov: number): void {
    if (Math.abs(this.viewCamera.fov - fov) > 0.01) {
      this.viewCamera.fov = fov;
      this.viewCamera.updateProjectionMatrix();
    }
  }
}
