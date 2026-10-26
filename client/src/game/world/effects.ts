import * as THREE from 'three';

/**
 * 视觉特效池：火花(单 Points 网格)、弹道拖尾、爆炸、枪口光。
 * 全部对象池复用，零分配热路径。
 */

interface Tracer { mesh: THREE.Mesh; life: number; maxLife: number }

interface Spark {
  pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number;
  color: THREE.Color; size: number;
}

interface Blast { mesh: THREE.Mesh; light: THREE.PointLight; life: number; maxLife: number }

const MAX_SPARKS = 600;

export class Effects {
  private scene: THREE.Scene;
  private tracers: Tracer[] = [];
  private tracerPool: Tracer[] = [];
  private blasts: Blast[] = [];
  private blastPool: Blast[] = [];

  // 火花 Points 云
  private sparkGeo: THREE.BufferGeometry;
  private sparkPos: Float32Array;
  private sparkCol: Float32Array;
  private sparkSize: Float32Array;
  private sparks: Spark[] = [];
  private points: THREE.Points;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(MAX_SPARKS * 3);
    this.sparkCol = new Float32Array(MAX_SPARKS * 3);
    this.sparkSize = new Float32Array(MAX_SPARKS);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.sparkGeo.setAttribute('psize', new THREE.BufferAttribute(this.sparkSize, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute float psize;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * (140.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor, a);
        }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(this.sparkGeo, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /** 弹道拖尾 */
  tracer(from: THREE.Vector3, to: THREE.Vector3, color: string, width = 0.02): void {
    let t = this.tracerPool.pop();
    if (!t) {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
      geo.translate(0, 0.5, 0);
      geo.rotateX(Math.PI / 2); // 沿 +Z
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      t = { mesh, life: 0, maxLife: 0.07 };
      this.scene.add(mesh);
    }
    const mat = t.mesh.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    const dir = to.clone().sub(from);
    const len = dir.length();
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(width, width, len);
    t.mesh.visible = true;
    t.life = t.maxLife = 0.06 + len * 0.0008;
    this.tracers.push(t);
  }

  /** 火花爆发 */
  spark(point: THREE.Vector3, normal: THREE.Vector3, color: string, count = 8, power = 4): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= MAX_SPARKS) break;
      const v = new THREE.Vector3(
        (Math.random() - 0.5), (Math.random() - 0.3), (Math.random() - 0.5),
      ).normalize().multiplyScalar(power * (0.4 + Math.random()));
      v.addScaledVector(normal, power * 0.6);
      this.sparks.push({
        pos: point.clone(), vel: v,
        life: 0.25 + Math.random() * 0.3, maxLife: 0.55,
        color: c.clone(), size: 0.5 + Math.random() * 1.4,
      });
    }
  }

  /** 爆炸 */
  explosion(point: THREE.Vector3, radius: number, color = '#ff8a3c'): void {
    let b = this.blastPool.pop();
    if (!b) {
      const geo = new THREE.SphereGeometry(1, 18, 14);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      const light = new THREE.PointLight(0xffaa55, 0, radius * 6, 2);
      mesh.add(light);
      this.scene.add(mesh);
      b = { mesh, light, life: 0, maxLife: 0.4 };
    }
    (b.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    b.light.color.set(color);
    b.light.intensity = radius * 30;
    b.mesh.position.copy(point);
    b.mesh.scale.setScalar(radius * 0.3);
    b.mesh.visible = true;
    b.life = b.maxLife = 0.38;
    this.blasts.push(b);

    this.spark(point, new THREE.Vector3(0, 1, 0), color, 26, radius * 3);
  }

  update(dt: number): void {
    // 拖尾
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]!;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.visible = false;
        this.tracers.splice(i, 1);
        this.tracerPool.push(t);
      } else {
        (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (t.life / t.maxLife);
      }
    }

    // 火花
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i]!;
      s.life -= dt;
      if (s.life <= 0) { this.sparks.splice(i, 1); continue; }
      s.vel.y -= 14 * dt;
      s.vel.multiplyScalar(1 - 2.2 * dt);
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < 0.02) { s.pos.y = 0.02; s.vel.y *= -0.4; s.vel.x *= 0.7; s.vel.z *= 0.7; }
    }
    for (const s of this.sparks) {
      const k = s.life / s.maxLife;
      this.sparkPos[n * 3] = s.pos.x;
      this.sparkPos[n * 3 + 1] = s.pos.y;
      this.sparkPos[n * 3 + 2] = s.pos.z;
      this.sparkCol[n * 3] = s.color.r * k;
      this.sparkCol[n * 3 + 1] = s.color.g * k;
      this.sparkCol[n * 3 + 2] = s.color.b * k;
      this.sparkSize[n] = s.size * (0.5 + k * 0.5);
      n++;
    }
    this.sparkGeo.setDrawRange(0, n);
    (this.sparkGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.sparkGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (this.sparkGeo.getAttribute('psize') as THREE.BufferAttribute).needsUpdate = true;

    // 爆炸
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i]!;
      b.life -= dt;
      const k = 1 - b.life / b.maxLife;
      if (b.life <= 0) {
        b.mesh.visible = false;
        this.blasts.splice(i, 1);
        this.blastPool.push(b);
        continue;
      }
      b.mesh.scale.setScalar(0.3 + k * 2.4 * (b.light.distance / 12));
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      b.light.intensity *= 1 - 6 * dt;
    }
  }
}
