import * as THREE from 'three';
import { ENEMIES, killGold } from '@combat-strike/shared';
import type { ChapterDef, EnemyKind, WeaponDef } from '@combat-strike/shared';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { Physics } from './world/physics.js';
import { buildChapterMap, type MapData } from './world/mapgen.js';
import { Effects } from './world/effects.js';
import { Player } from './player/controller.js';
import { Viewmodel } from './weapons/viewmodel.js';
import { WeaponSystem } from './weapons/system.js';
import { SkillSystem } from './weapons/skills.js';
import { Pickups } from './world/pickups.js';
import { EnemyManager } from './enemies/enemies.js';
import { Campaign } from './campaign.js';
import { Hud } from './hud/hud.js';
import type { Settings } from '../config.js';

/**
 * 对局主控：把引擎/输入/物理/地图/玩家/武器/敌人/波次/HUD 组装成主循环，
 * 处理暂停、胜负结算与资源释放。
 */

export interface RunSummary {
  chapter: number;
  success: boolean;
  kills: number;
  wave: number;
  timeSec: number;
}

export class Game {
  engine: Engine;
  input: Input;
  audio = new AudioEngine();
  physics = new Physics();
  effects: Effects;
  player = new Player();
  viewmodel: Viewmodel;
  weapons: WeaponSystem;
  enemyMgr: EnemyManager;
  campaign: Campaign;
  hud: Hud;
  skills: SkillSystem;
  pickups: Pickups;

  // 连击
  private comboCount = 0;
  private comboT = 0;
  private static readonly COMBO_WINDOW = 4;

  private scene: THREE.Scene;
  private mapData: MapData | null = null;
  private chapter: ChapterDef | null = null;
  private running = false;
  private paused = false;
  private rafId = 0;
  private lastT = 0;
  private time = 0;
  private fpsAvg = 60;
  private gold = 0;

  private pauseOverlay: HTMLDivElement | null = null;
  private settings: Settings;
  private onRunEnd?: (summary: RunSummary) => void;
  private ended = false;

  constructor(canvas: HTMLCanvasElement, hudParent: HTMLElement, settings: Settings) {
    this.settings = settings;
    this.engine = new Engine(canvas, settings);
    this.scene = this.engine.scene;
    this.input = new Input(canvas);
    this.input.setSettings(settings.sensitivity, settings.invertY);
    this.effects = new Effects(this.scene);
    this.hud = new Hud(hudParent);
    this.hud.bindCamera(this.engine.camera);
    this.hud.setShowDamage(settings.showDamage);
    this.viewmodel = new Viewmodel(this.engine.viewScene);

    const enemyHooks = {
      onPlayerDamaged: (amount: number, fromPos: THREE.Vector3) => {
        const dx = fromPos.x - this.player.pos.x;
        const dz = fromPos.z - this.player.pos.z;
        const worldAngle = Math.atan2(dx, dz);
        const rel = worldAngle + this.player.yaw + Math.PI;
        this.hud.damageDirection(rel);
        void amount;
      },
      onEnemyKilled: (kind: EnemyKind, pos: THREE.Vector3, isBoss: boolean) => {
        // 所有死亡来源（武器/爆炸/技能）统一在此计入击杀，金币以拾取物掉落
        this.campaign.onEnemyKilled(kind, pos);
        const g = Math.max(1, Math.round(killGold(this.chapter?.id ?? 1) * (isBoss ? 10 : (ENEMIES[kind]?.gold ?? 1))));
        this.pickups.drop(pos, g, isBoss);
        // 击杀爆裂 + 连击
        this.effects.spark(pos.clone().setY(pos.y + 0.8), new THREE.Vector3(0, 1, 0), isBoss ? '#ffd75c' : '#ff8a4f', isBoss ? 36 : 10, isBoss ? 8 : 4);
        this.comboCount += 1;
        this.comboT = Game.COMBO_WINDOW;
        if (isBoss) {
          this.effects.explosion(pos.clone().setY(2), 6, '#ffd75c');
          this.audio.victory();
          this.hud.killfeed('BOSS 已被摧毁');
        } else if (this.comboCount >= 5 && this.comboCount % 5 === 0) {
          this.hud.killfeed(`${this.comboCount} 连击！`);
        } else {
          this.hud.killfeed(`击杀 ${ENEMIES[kind]?.name ?? '敌人'}`);
        }
      },
      onStatusDamage: (pos: THREE.Vector3, amount: number) => {
        this.hud.damageNumber(pos.clone().setY(pos.y + 1), amount, false);
      },
    };

    this.enemyMgr = new EnemyManager(this.scene, this.physics, this.effects, this.audio, this.player, enemyHooks);
    this.weapons = new WeaponSystem(
      this.scene, this.physics, this.effects, this.audio, this.input, this.player, this.viewmodel,
      this.hud, () => this.enemyMgr.enemies,
    );
    this.weapons.bindCamera(this.engine.camera);
    this.skills = new SkillSystem(
      this.scene, this.physics, this.effects, this.audio, this.player, this.weapons,
      { setSkill: (n, c, r) => this.hud.setSkill(n, c, r), announce: (t, sub) => this.hud.announce(t, sub) },
      () => this.engine.camera,
    );
    this.weapons.skills = this.skills;
    // 强化弹回调
    this.skills.onPowerShot = (shots, mult) => { this.weapons.setPowerShots(shots, mult); };
    this.pickups = new Pickups(this.scene, this.audio);
    this.pickups.onCollect = (value) => {
      this.gold += value;
      this.campaign.notifyGold(this.gold);
    };
    this.campaign = new Campaign(this.enemyMgr, this.player, this.weapons, this.audio, this.hud);

    this.player.onFootstep = () => this.audio.footstep();
    this.player.onLand = () => this.audio.jump();

    this.input.onLock((locked) => {
      if (!locked && this.running && !this.paused && !this.ended) this.pause();
    });

    window.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' && this.running && !this.ended) {
      if (this.paused) this.resume();
      // 未暂停时由 pointerlock 丢失回调触发 pause
    }
  };

  startChapter(chapter: ChapterDef, primary: WeaponDef, secondary: WeaponDef, maxHp: number, onRunEnd: (summary: RunSummary) => void, upgrades: Record<string, number> = {}): void {
    this.chapter = chapter;
    this.ended = false;
    this.gold = 0;
    this.comboCount = 0;
    this.comboT = 0;
    this.onRunEnd = onRunEnd;

    // 场景重建
    this.clearScene();
    this.mapData = buildChapterMap(chapter, this.physics, this.settings.quality);
    this.scene.add(this.mapData.group);
    this.scene.background = new THREE.Color(chapter.skyColor);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(chapter.fogColor).getHex(), chapter.fogDensity);

    this.player.maxHp = maxHp;
    this.pickups.clear();
    this.skills.clearZones();
    this.campaign.begin(chapter, this.mapData, primary, secondary, (victory) => {
      this.ended = true;
      this.input.releaseLock();
      this.pickups.flushAll(); // 结算自动拾取剩余金币
      this.hud.combo(0, 0);
      this.onRunEnd?.({
        chapter: chapter.id,
        success: victory,
        kills: this.campaign.kills,
        wave: this.campaign.wave,
        timeSec: Math.round(this.campaign.elapsedSec),
      });
      if (victory) this.audio.victory(); else this.audio.defeat();
    });

    this.hud.show();
    this.running = true;
    this.paused = false;
    this.lastT = performance.now();
    this.audio.ensure();
    this.audio.stopMusic();
    void this.input.requestLock();
    this.ensureLoop();
  }

  /**
   * 双通道调度：优先 rAF（60fps）；窗口被遮挡时 rAF 停摆，
   * 由 33ms 定时器兜底（约 30fps），保证模拟与渲染持续运行。
   */
  private ensureLoop(): void {
    if (!this.rafId) {
      this.lastT = performance.now();
      this.rafId = requestAnimationFrame(this.tick);
    }
    if (!this.fallbackTimer) {
      this.fallbackTimer = setInterval(() => {
        if (!this.running) return;
        if (performance.now() - this.lastFrameAt < 80) return; // rAF 正常工作
        this.tick(performance.now());
      }, 33);
    }
  }

  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;

  private clearScene(): void {
    if (this.mapData) {
      this.scene.remove(this.mapData.group);
      this.mapData.dispose();
      this.mapData = null;
    }
    this.enemyMgr.clear();
    this.pickups.clear();
    this.skills.clearZones();
  }

  pause(): void {
    if (!this.running || this.paused || this.ended) return;
    this.paused = true;
    this.input.releaseLock();
    this.audio.suspend();
    this.showPause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.hidePause();
    this.audio.resume();
    void this.input.requestLock();
    this.lastT = performance.now();
  }

  private showPause(): void {
    if (this.pauseOverlay) return;
    const overlay = document.createElement('div');
    overlay.className = 'pause-overlay';
    overlay.innerHTML = `
      <div class="pause-title">战术暂停</div>
      <div class="pause-menu">
        <button class="btn primary" data-act="resume">继续作战</button>
        <button class="btn ghost" data-act="quit">撤出战场（结算失败）</button>
      </div>
      <div style="color:var(--text-2);font-size:13px;letter-spacing:2px">WASD 移动 · Shift 冲刺 · Ctrl 蹲伏 · R 换弹 · F/中键 技能 · 1/2/Q 切枪 · 右键开镜</div>
    `;
    overlay.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const act = target.getAttribute('data-act');
      if (act === 'resume') this.resume();
      else if (act === 'quit') this.quitRun();
    });
    this.hud.root.parentElement?.appendChild(overlay);
    this.pauseOverlay = overlay;
  }

  private hidePause(): void {
    this.pauseOverlay?.remove();
    this.pauseOverlay = null;
  }

  private quitRun(): void {
    if (this.ended) return;
    this.ended = true;
    this.paused = false;
    this.hidePause();
    this.input.releaseLock();
    this.onRunEnd?.({
      chapter: this.chapter?.id ?? 1,
      success: false,
      kills: this.campaign.kills,
      wave: this.campaign.wave,
      timeSec: Math.round(this.campaign.elapsedSec),
    });
  }

  /** 返回主菜单：停止循环并清理 */
  exitToMenu(): void {
    this.running = false;
    this.ended = true;
    this.paused = false;
    this.hidePause();
    this.hud.hide();
    this.input.releaseLock();
    this.clearScene();
    this.campaign.stop();
    this.audio.startMusic();
  }

  private tick = (now: number): void => {
    this.lastFrameAt = performance.now();
    const now2 = performance.now();
    let dt = (now2 - this.lastT) / 1000;
    this.lastT = now2;
    if (dt > 0.1) dt = 0.1; // 防切页大步长

    if (this.running && !this.paused) {
      this.time += dt;
      this.fpsAvg = this.fpsAvg * 0.95 + (1 / Math.max(dt, 0.0001)) * 0.05;

      // 更新
      this.player.update(dt, this.input, this.physics);
      this.player.moveMult = this.weapons.current.moveMult;
      this.campaign.update(dt);
      this.enemyMgr.update(dt, this.time);
      this.weapons.update(dt, this.enemyMgr.enemies);
      this.skills.update(dt, this.enemyMgr.enemies);
      this.pickups.update(dt, this.player.pos);

      // 连击窗口
      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) this.comboCount = 0;
        this.hud.combo(this.comboCount, this.comboT / Game.COMBO_WINDOW);
      }
      this.viewmodel.update(
        dt, this.player.moveNorm, this.player.onGround,
        this.input.mouseDX, this.input.mouseDY, this.player.sprintK,
      );
      this.effects.update(dt);
      this.player.applyToCamera(this.engine.camera);
      const adsK = this.viewmodel.isAds();
      this.engine.setViewFov(adsK ? 46 : this.settings.fov);
      this.hud.update(dt, this.player, this.enemyMgr.enemies, this.gold, this.mapData?.halfSize ?? 44, this.fpsAvg);

      // 死亡判定
      if (this.player.hp <= 0 && !this.ended) {
        this.campaign.notifyDeath();
      }
    }

    this.input.endFrame();
    if (!(this as unknown as { __noRender?: boolean }).__noRender) this.engine.render();

    // 仅在运行中续订 rAF（手动快进调用不会堆积帧回调）
    if (this.running) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.rafId = 0;
    }
  };

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (this.fallbackTimer) { clearInterval(this.fallbackTimer); this.fallbackTimer = null; }
    window.removeEventListener('keydown', this.onKeyDown);
    this.hud.destroy();
    this.clearScene();
    this.audio.stopMusic();
  }
}
