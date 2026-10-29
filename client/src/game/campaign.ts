import * as THREE from 'three';
import { waveComposition, BOSS_NAMES, enemyHpMult } from '@combat-strike/shared';
import { BOSS_ELEMENT_COLORS } from './world/bossColors.js';
import type { ChapterDef, EnemyKind, WeaponDef } from '@combat-strike/shared';
import type { EnemyManager } from './enemies/enemies.js';
import type { Player } from './player/controller.js';
import type { WeaponSystem } from './weapons/system.js';
import type { HudHooks } from './types.js';
import type { AudioEngine } from './core/audio.js';
import type { MapData } from './world/mapgen.js';

/**
 * 战役波次导演：波间休整 → 生成敌人（限流）→ 清波奖励 → 下一波 → 通关/失败。
 */
export class Campaign {
  state: 'combat' | 'intermission' | 'victory' | 'defeat' = 'intermission';
  chapter: ChapterDef | null = null;
  mapData: MapData | null = null;
  wave = 0;
  kills = 0;
  waveKills = 0;
  waveTotal = 0;
  startTime = 0;
  goldEarned = 0;

  private spawnQueue: EnemyKind[] = [];
  private spawnTimer = 0;
  private intermissionT = 0;
  private maxAlive = 14;

  private onEnd?: (victory: boolean) => void;
  private primaryId = '';
  private secondaryId = '';

  constructor(
    private enemies: EnemyManager,
    private player: Player,
    private weapons: WeaponSystem,
    private audio: AudioEngine,
    private hud: HudHooks,
  ) {}

  begin(chapter: ChapterDef, mapData: MapData, primary: WeaponDef, secondary: WeaponDef, onEnd: (victory: boolean) => void, upgrades: Record<string, number> = {}): void {
    this.chapter = chapter;
    this.mapData = mapData;
    this.primaryId = primary.id;
    this.secondaryId = secondary.id;
    this.wave = 0;
    this.kills = 0;
    this.waveKills = 0;
    this.waveTotal = 0;
    this.goldEarned = 0;
    this.spawnQueue = [];
    this.startTime = performance.now();
    this.state = 'intermission';
    this.intermissionT = 3.5;
    this.onEnd = onEnd;

    this.player.spawn(mapData.playerStart.clone(), this.player.maxHp);
    this.weapons.equip(primary, secondary, upgrades);
    this.hud.announce(chapter.name, chapter.subtitle);
    this.hud.setWaveInfo('准备', '敌人正在集结…', 0);
  }

  stop(): void {
    this.state = 'intermission';
    this.spawnQueue = [];
    this.chapter = null;
  }

  get elapsedSec(): number {
    return (performance.now() - this.startTime) / 1000;
  }

  update(dt: number): void {
    if (!this.chapter || this.state === 'victory' || this.state === 'defeat') return;
    const ch = this.chapter;

    if (this.state === 'intermission') {
      this.intermissionT -= dt;
      if (this.intermissionT <= 0) this.startWave();
      else {
        this.hud.setWaveInfo(
          `第 ${this.wave}/${ch.waves} 波 结束`,
          `下一波 ${Math.ceil(this.intermissionT)}s — 敌人正在集结`,
          this.waveTotal > 0 ? this.waveKills / this.waveTotal : 0,
        );
      }
      return;
    }

    // ---- combat ----
    // 限流生成
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemies.aliveCount < this.maxAlive) {
        const kind = this.spawnQueue.shift()!;
        this.spawnEnemy(kind);
        this.spawnTimer = 0.45 + Math.random() * 0.5;
      }
    }

    const remaining = this.spawnQueue.length + this.enemies.aliveCount;
    const progress = this.waveTotal > 0 ? 1 - remaining / this.waveTotal : 1;
    this.hud.setWaveInfo(
      `第 ${this.wave}/${ch.waves} 波`,
      remaining > 0 ? `剩余敌人 ${remaining}` : '区域安全',
      progress,
    );

    if (remaining === 0) {
      // 波次清空
      if (this.wave >= ch.waves) {
        this.victory();
      } else {
        this.state = 'intermission';
        this.intermissionT = 6;
        this.player.heal(Math.round(this.player.maxHp * 0.22));
        // 黎明之光被动：圣光灌注（波次休整额外 +20%）
        if (this.primaryId === 'dawn-light' || this.secondaryId === 'dawn-light') {
          this.player.heal(Math.round(this.player.maxHp * 0.2));
        }
        this.hud.announce(`第 ${this.wave} 波 清除`, '生命回复 · 准备迎接下一波');
        // 补给：备弹恢复一部分
        this.resupply();
      }
    }
  }

  private startWave(): void {
    const ch = this.chapter!;
    this.wave += 1;
    this.waveKills = 0;
    const comp = waveComposition(ch.id, this.wave, ch.waves);
    const queue: EnemyKind[] = [];
    for (const [kind, n] of Object.entries(comp)) {
      for (let i = 0; i < (n ?? 0); i++) queue.push(kind as EnemyKind);
    }
    // 每章终波 → 专属 BOSS
    if (BOSS_NAMES[ch.id] && this.wave === ch.waves) queue.push('boss');
    // 打乱
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j]!, queue[i]!];
    }
    this.spawnQueue = queue;
    this.waveTotal = queue.length;
    this.state = 'combat';
    this.spawnTimer = 0.5;
    this.audio.waveStart();
    const boss = this.wave === ch.waves ? BOSS_NAMES[ch.id] : undefined;
    this.hud.announce(boss ? `BOSS · ${boss.name}` : `第 ${this.wave} 波`, boss ? '击杀 BOSS' : '消灭所有敌人');
  }

  private spawnEnemy(kind: EnemyKind): void {
    const map = this.mapData!;
    const spawns = map.spawnPoints;
    // 选择离玩家较远的出生点
    let best = spawns[0]!;
    let bestD = -1;
    for (let i = 0; i < 3; i++) {
      const cand = spawns[Math.floor(Math.random() * spawns.length)]!;
      const d = cand.distanceToSquared(this.player.pos);
      if (d > bestD) { bestD = d; best = cand; }
    }
    const at = best.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
    const accent = kind === 'boss'
      ? BOSS_ELEMENT_COLORS[BOSS_NAMES[this.chapter!.id]?.element ?? 'none']
      : kind === 'elite' ? this.chapter!.accentColor : undefined;
    const e = this.enemies.spawn(kind, this.chapter!.id, at, accent);
    if (kind === 'boss') {
      const info = BOSS_NAMES[this.chapter!.id];
      if (info) e.name = info.name;
    }
  }

  private resupply(): void {
    // 波间补给由武器系统自行处理（备弹），这里仅提示
    this.hud.announce('补给送达', '备弹已补充');
  }

  /** 武器系统击杀回调（统计 + 金币飘字） */
  onEnemyKilled(kind: EnemyKind, pos: THREE.Vector3): void {
    this.kills += 1;
    this.waveKills += 1;
    void kind; void pos;
  }

  notifyDeath(): void {
    if (this.state === 'victory' || this.state === 'defeat') return;
    this.state = 'defeat';
    this.onEnd?.(false);
  }

  private victory(): void {
    this.state = 'victory';
    this.onEnd?.(true);
  }

  /** 玩家金币增益提示（由 Game 根据击杀调用） */
  notifyGold(amount: number): void {
    this.goldEarned += amount;
    this.hud.gold(amount);
  }

  /** 敌人血量参考（HUD 用） */
  static chapterHpScale(chapter: number): number {
    return enemyHpMult(chapter);
  }
}
