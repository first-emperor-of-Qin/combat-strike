import * as THREE from 'three';
import type { HudHooks } from '../types.js';

/**
 * 战斗 HUD（DOM 覆盖层）：血量/弹药/波次/小地图/准星/命中标记/伤害数字/
 * 击杀播报/BOSS 血条/受击方向与低血量警示。全部由池化 DOM 驱动。
 */

interface FloatNumber {
  el: HTMLDivElement;
  world: THREE.Vector3;
  life: number;
  vy: number;
}

interface FeedItem { el: HTMLDivElement; life: number }

export class Hud implements HudHooks {
  root: HTMLDivElement;

  private hpBar!: HTMLDivElement;
  private hpText!: HTMLDivElement;
  private hpGhost!: HTMLDivElement;
  private ammoMag!: HTMLDivElement;
  private ammoReserve!: HTMLDivElement;
  private weaponName!: HTMLDivElement;
  private reloadHint!: HTMLDivElement;
  private waveTitle!: HTMLDivElement;
  private waveSub!: HTMLDivElement;
  private waveBar!: HTMLDivElement;
  private goldText!: HTMLDivElement;
  private killfeedEl!: HTMLDivElement;
  private bossWrap!: HTMLDivElement;
  private bossName!: HTMLDivElement;
  private bossBarEl!: HTMLDivElement;
  private vignetteEl!: HTMLDivElement;
  private announceWrap!: HTMLDivElement;
  private announceTitle!: HTMLDivElement;
  private announceSub!: HTMLDivElement;
  private crosshair!: HTMLDivElement;
  private hitmarkerEl!: HTMLDivElement;
  private minimap!: HTMLCanvasElement;
  private dmgDirWrap!: HTMLDivElement;
  private fpsText!: HTMLDivElement;

  private dmgNumbers: FloatNumber[] = [];
  private numberPool: HTMLDivElement[] = [];
  private feeds: FeedItem[] = [];
  private dirIndicators: { el: HTMLDivElement; life: number; angle: number }[] = [];

  private ghostHp = 100;
  private lowBeepT = 0;
  private showDamage = true;

  // 相机由 Game 注入用于投影
  private camera: THREE.PerspectiveCamera | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-root';
    this.root.innerHTML = this.template();
    parent.appendChild(this.root);
    this.grabRefs();
  }

  private template(): string {
    return `
      <div class="hud-top-left">
        <div class="wave-title" id="hud-wave-title">准备</div>
        <div class="wave-sub" id="hud-wave-sub"></div>
        <div class="wave-bar-wrap"><div class="wave-bar" id="hud-wave-bar"></div></div>
      </div>
      <div class="hud-top-right">
        <div class="gold-chip"><span class="gold-icon">◉</span><span id="hud-gold">0</span></div>
        <canvas id="hud-minimap" width="150" height="150"></canvas>
        <div class="killfeed" id="hud-killfeed"></div>
        <div class="fps" id="hud-fps"></div>
      </div>
      <div class="hud-boss" id="hud-boss-wrap" style="display:none">
        <div class="boss-name" id="hud-boss-name"></div>
        <div class="boss-bar-wrap"><div class="boss-bar" id="hud-boss-bar"></div></div>
      </div>
      <div class="hud-announce" id="hud-announce">
        <div class="announce-title" id="hud-announce-title"></div>
        <div class="announce-sub" id="hud-announce-sub"></div>
      </div>
      <div class="hud-bottom-left">
        <div class="hp-row">
          <div class="hp-label">生命</div>
          <div class="hp-bar-wrap">
            <div class="hp-ghost" id="hud-hp-ghost"></div>
            <div class="hp-bar" id="hud-hp-bar"></div>
          </div>
          <div class="hp-text" id="hud-hp-text">100</div>
        </div>
      </div>
      <div class="hud-bottom-right">
        <div class="reload-hint" id="hud-reload">换弹中…</div>
        <div class="ammo-row">
          <span class="ammo-mag" id="hud-ammo-mag">30</span>
          <span class="ammo-sep">/</span>
          <span class="ammo-reserve" id="hud-ammo-reserve">240</span>
        </div>
        <div class="weapon-name" id="hud-weapon"></div>
      </div>
      <div class="hud-crosshair" id="hud-crosshair">
        <span class="ch ch-t"></span><span class="ch ch-b"></span>
        <span class="ch ch-l"></span><span class="ch ch-r"></span>
        <span class="ch-dot"></span>
      </div>
      <div class="hitmarker" id="hud-hitmarker">
        <span></span><span></span><span></span><span></span>
      </div>
      <div class="dmg-vignette" id="hud-vignette"></div>
      <div class="dmg-dir-wrap" id="hud-dmg-dir"></div>
      <div class="dmg-numbers" id="hud-dmg-numbers"></div>
    `;
  }

  private grabRefs(): void {
    const q = (id: string): HTMLDivElement => this.root.querySelector(`#${id}`) as HTMLDivElement;
    this.hpBar = q('hud-hp-bar'); this.hpText = q('hud-hp-text'); this.hpGhost = q('hud-hp-ghost');
    this.ammoMag = q('hud-ammo-mag'); this.ammoReserve = q('hud-ammo-reserve');
    this.weaponName = q('hud-weapon'); this.reloadHint = q('hud-reload');
    this.waveTitle = q('hud-wave-title'); this.waveSub = q('hud-wave-sub'); this.waveBar = q('hud-wave-bar');
    this.goldText = q('hud-gold');
    this.killfeedEl = q('hud-killfeed');
    this.bossWrap = q('hud-boss-wrap'); this.bossName = q('hud-boss-name'); this.bossBarEl = q('hud-boss-bar');
    this.vignetteEl = q('hud-vignette');
    this.announceWrap = q('hud-announce'); this.announceTitle = q('hud-announce-title'); this.announceSub = q('hud-announce-sub');
    this.crosshair = q('hud-crosshair');
    this.hitmarkerEl = q('hud-hitmarker');
    this.minimap = this.root.querySelector('#hud-minimap') as HTMLCanvasElement;
    this.dmgDirWrap = q('hud-dmg-dir');
    this.fpsText = q('hud-fps');
  }

  bindCamera(camera: THREE.PerspectiveCamera): void { this.camera = camera; }
  setShowDamage(v: boolean): void { this.showDamage = v; }

  // ---------------- 实现接口 ----------------
  setHp(hp: number, maxHp: number): void {
    const frac = Math.max(0, hp / maxHp);
    this.hpBar.style.width = `${frac * 100}%`;
    this.hpBar.style.background = frac > 0.5 ? 'linear-gradient(90deg,#4caf50,#8fe06a)'
      : frac > 0.25 ? 'linear-gradient(90deg,#ffb020,#ffd75c)' : 'linear-gradient(90deg,#ff3860,#ff6a6a)';
    this.hpText.textContent = `${Math.ceil(hp)}`;
    this.vignetteEl.style.opacity = String(Math.max(0, 1 - frac / 0.35) * 0.85);
    if (frac < 0.3 && this.lowBeepT <= 0) {
      this.lowBeepT = 1;
      this.vignetteEl.animate([{ opacity: 0.9 }, { opacity: 0.55 }], { duration: 400 });
    }
  }

  setAmmo(mag: number, reserve: number, name: string, reloading: boolean): void {
    this.ammoMag.textContent = String(mag);
    this.ammoReserve.textContent = String(reserve);
    this.weaponName.textContent = name;
    this.reloadHint.style.display = reloading ? 'block' : 'none';
    this.ammoMag.style.color = mag === 0 ? 'var(--danger)' : mag <= 5 ? 'var(--accent-2)' : 'var(--text-0)';
  }

  setWaveInfo(title: string, sub: string, progress: number): void {
    this.waveTitle.textContent = title;
    this.waveSub.textContent = sub;
    this.waveBar.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  }

  bossBar(name: string | null, hpFrac: number): void {
    if (!name) { this.bossWrap.style.display = 'none'; return; }
    this.bossWrap.style.display = 'block';
    this.bossName.textContent = name;
    this.bossBarEl.style.width = `${Math.max(0, Math.min(1, hpFrac)) * 100}%`;
  }

  hitmarker(headshot: boolean): void {
    this.hitmarkerEl.classList.remove('show', 'head');
    void this.hitmarkerEl.offsetWidth;
    this.hitmarkerEl.classList.add('show');
    if (headshot) this.hitmarkerEl.classList.add('head');
  }

  killfeed(text: string): void {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.textContent = text;
    this.killfeedEl.prepend(el);
    this.feeds.push({ el, life: 4 });
    while (this.feeds.length > 5) {
      const f = this.feeds.shift()!;
      f.el.remove();
    }
  }

  damageNumber(worldPos: THREE.Vector3, amount: number, headshot: boolean): void {
    if (!this.showDamage) return;
    let el = this.numberPool.pop();
    if (!el) {
      el = document.createElement('div');
      el.className = 'dmg-number';
      this.root.querySelector('.dmg-numbers')!.appendChild(el);
    }
    el.style.display = 'block';
    el.textContent = String(amount);
    el.className = `dmg-number ${headshot ? 'head' : ''}`;
    el.style.opacity = '1';
    this.dmgNumbers.push({ el, world: worldPos.clone(), life: 0.8, vy: 0 });
  }

  damageDirection(angle: number): void {
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.transform = `rotate(${angle}rad)`;
    this.dmgDirWrap.appendChild(el);
    this.dirIndicators.push({ el, life: 1, angle });
  }

  vignette(_intensity: number): void { void _intensity; }

  crosshairSpread(spreadDeg: number): void {
    // 散布角 → 屏幕像素（近似：tan(角度) × 屏高焦距）
    const h = window.innerHeight;
    const px = Math.min(60, Math.tan(spreadDeg * Math.PI / 180) * h * 0.9 + 6);
    this.crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
  }

  announce(title: string, sub = ''): void {
    this.announceTitle.textContent = title;
    this.announceSub.textContent = sub;
    this.announceWrap.classList.remove('show');
    void this.announceWrap.offsetWidth;
    this.announceWrap.classList.add('show');
  }

  gold(amount: number): void {
    this.goldText.textContent = String(Math.round(amount));
  }

  // ---------------- 每帧 ----------------
  update(dt: number, player: { pos: THREE.Vector3; hp: number; maxHp: number; yaw: number }, enemies: { alive: boolean; pos: THREE.Vector3; isBoss?: boolean; hp?: number; maxHp?: number; name?: string }[], gold: number, halfSize: number, fps: number): void {
    this.lowBeepT -= dt;
    this.setHp(player.hp, player.maxHp);

    // 伤害数字投影
    for (let i = this.dmgNumbers.length - 1; i >= 0; i--) {
      const d = this.dmgNumbers[i]!;
      d.life -= dt;
      d.world.y += dt * 1.2;
      if (d.life <= 0 || !this.camera) {
        d.el.style.display = 'none';
        this.numberPool.push(d.el);
        this.dmgNumbers.splice(i, 1);
        continue;
      }
      const v = d.world.clone().project(this.camera);
      if (v.z > 1) { d.el.style.opacity = '0'; continue; }
      const x = (v.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
      d.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px)`;
      d.el.style.opacity = String(Math.min(1, d.life / 0.4));
    }

    // 击杀播报
    for (let i = this.feeds.length - 1; i >= 0; i--) {
      const f = this.feeds[i]!;
      f.life -= dt;
      if (f.life <= 0) { f.el.remove(); this.feeds.splice(i, 1); }
      else if (f.life < 1) f.el.style.opacity = String(f.life);
    }

    // 受击方向
    for (let i = this.dirIndicators.length - 1; i >= 0; i--) {
      const d = this.dirIndicators[i]!;
      d.life -= dt;
      if (d.life <= 0) { d.el.remove(); this.dirIndicators.splice(i, 1); }
      else d.el.style.opacity = String(d.life);
    }

    // 小地图
    this.drawMinimap(player, enemies, halfSize);

    // BOSS 条
    const boss = enemies.find((e) => e.alive && e.isBoss);
    if (boss) this.bossBar(boss.name ?? 'BOSS', (boss.hp ?? 1) / (boss.maxHp ?? 1));
    else this.bossBar(null, 0);

    this.gold(gold);
    this.fpsText.textContent = `${Math.round(fps)} FPS`;
  }

  private drawMinimap(player: { pos: THREE.Vector3; yaw: number }, enemies: { alive: boolean; pos: THREE.Vector3; isBoss?: boolean }[], halfSize: number): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    const S = this.minimap.width;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(player.yaw + Math.PI);

    const scale = (S / 2 - 6) / (halfSize + 2);
    // 边界
    ctx.strokeStyle = 'rgba(122,168,255,0.4)';
    ctx.strokeRect(-halfSize * scale, -halfSize * scale, halfSize * 2 * scale, halfSize * 2 * scale);
    // 敌人
    for (const e of enemies) {
      if (!e.alive) continue;
      const x = e.pos.x * scale;
      const y = e.pos.z * scale;
      ctx.fillStyle = 'rgba(255,90,90,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, e.isBoss ? 4 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 玩家箭头（中心，不旋转）
    ctx.fillStyle = '#7df9ff';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
  }

  show(): void { this.root.style.display = 'block'; }
  hide(): void { this.root.style.display = 'none'; }
  destroy(): void { this.root.remove(); }
}
