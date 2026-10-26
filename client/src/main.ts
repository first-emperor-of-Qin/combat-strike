import './styles/base.css';
import './styles/hud.css';
import './styles/menu.css';

import * as THREE from 'three';
import type { Profile, ChapterDef, WeaponDef } from '@combat-strike/shared';
import { WEAPON_MAP, playerMaxHp, xpForLevel } from '@combat-strike/shared';
import { api, setToken, isOffline } from './api.js';
import { loadSettings, type Settings } from './config.js';
import { Game, type RunSummary } from './game/gameloop.js';
import { showAuthScreen } from './ui/auth.js';
import { MainMenu } from './ui/menu.js';
import { showResults } from './ui/results.js';
import { el } from './ui/dom.js';

// ============================================================
// 应用启动
// ============================================================
const app = document.getElementById('app')!;

// 错误浮层（开发/线上均可视）
const errOverlay = el('div', { id: 'err-overlay' });
document.body.appendChild(errOverlay);
let errCount = 0;
function showError(msg: string): void {
  if (errCount >= 4) return;
  errCount++;
  const chip = el('div', { class: 'err-chip' }, msg);
  errOverlay.appendChild(chip);
  setTimeout(() => chip.remove(), 8000);
}
window.addEventListener('error', (e) => showError(`错误: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => showError(`异步错误: ${String(e.reason)}`));

// 游戏画布（常驻，菜单期间隐藏于界面之下）
const canvas = el('canvas', { class: 'game-canvas' });
app.appendChild(canvas);

const settings: Settings = loadSettings();

let game: Game | null = null;
let menu: MainMenu | null = null;
let profile: Profile | null = null;
let catalog: { weapons: WeaponDef[]; chapters: ChapterDef[]; bosses: Record<string, string> } | null = null;
let currentChapter: ChapterDef | null = null;
let resultsScreen: HTMLElement | null = null;

// 简易 BGM 控制在菜单与战斗间切换（由 Game 内部处理战斗静音）
function ensureGame(): Game {
  if (!game) {
    game = new Game(canvas, app, settings);
  }
  return game;
}

function applyRuntimeSettings(s: Settings): void {
  game?.engine.applySettings(s);
  if (game) {
    game.audio.volumes = { master: s.masterVolume, sfx: s.sfxVolume, music: s.musicVolume };
    game.audio.applyVolumes();
    game.input.setSettings(s.sensitivity, s.invertY);
    game.hud.setShowDamage(s.showDamage);
  }
}

function clearScreens(...screens: (HTMLElement | null)[]): void {
  for (const s of screens) s?.remove();
}

// ---------------- 登录后主流程 ----------------
async function enterMenu(): Promise<void> {
  clearScreens(menu?.root ?? null, resultsScreen);
  menu = null;
  if (!profile || !catalog) return;
  const xpNeeded = xpForLevel(profile.level);
  menu = new MainMenu(app, profile, catalog, xpNeeded, settings, {
    onStartChapter: (chapter) => void startChapter(chapter),
    onLogout: () => {
      setToken(null);
      localStorage.removeItem('cs2_demo_profile');
      location.reload();
    },
    onSettingsChanged: (s) => applyRuntimeSettings(s),
  });
  applyRuntimeSettings(settings);
  game?.audio.startMusic();
}

async function refreshProfile(): Promise<void> {
  try {
    const r = await api.me();
    profile = r.profile;
    menu?.updateProfile(r.profile, xpForLevel(r.profile.level));
  } catch {
    // token 失效 → 重新登录
    setToken(null);
    clearScreens(menu?.root ?? null);
    menu = null;
    bootAuth();
  }
}

async function startChapter(chapter: ChapterDef): Promise<void> {
  if (!profile || !catalog) return;
  currentChapter = chapter;
  clearScreens(menu?.root ?? null, resultsScreen);
  menu?.destroy();
  menu = null;

  // 拉取最新档案（商城/军械库操作可能已更新配装）
  try {
    profile = (await api.me()).profile;
  } catch { /* 使用缓存档案 */ }

  const g = ensureGame();
  g.audio.ensure();
  g.audio.stopMusic();

  // 配装（未配置时回退初始武器）
  const primaryId = profile.loadout.primary ?? 'thunder-mk1';
  const secondaryId = profile.loadout.secondary ?? 'shadow-smg';
  const primary = WEAPON_MAP.get(primaryId) ?? WEAPON_MAP.get('thunder-mk1')!;
  const secondary = WEAPON_MAP.get(secondaryId) ?? WEAPON_MAP.get('shadow-smg')!;

  const maxHp = playerMaxHp(profile.level);
  g.startChapter(chapter, primary, secondary, maxHp, (summary) => void onRunEnd(summary));
}

async function onRunEnd(summary: RunSummary): Promise<void> {
  if (!profile || !catalog || !currentChapter) return;
  const chapter = currentChapter;
  // 结算：服务端计算奖励（离线模式本地计算）
  let reward: import('@combat-strike/shared').RunReward = {
    gold: 0, xp: 0, levelUp: false, newLevel: profile.level, firstClear: false, dailyFirst: false, unlockedChapter: null,
  };
  try {
    const r = await api.completeRun(chapter.id, summary.success, summary.kills, summary.wave, summary.timeSec);
    profile = r.profile;
    reward = r.reward;
  } catch (e) {
    showError(e instanceof Error ? e.message : '结算失败');
  }
  clearScreens(resultsScreen);
  showResults(app, summary, chapter, reward,
    () => { clearScreens(resultsScreen); resultsScreen = null; void startChapter(chapter); },
    () => { clearScreens(resultsScreen); resultsScreen = null; void enterMenu(); },
  );
  resultsScreen = app.querySelector('.results-screen');
  applyRuntimeSettings(settings);
}

// ---------------- 启动 ----------------
async function bootAuth(): Promise<void> {
  clearScreens(menu?.root ?? null, resultsScreen);
  menu = null;
  showAuthScreen(app, (resp) => {
    profile = resp.profile;
    void bootCatalog().then(() => enterMenu());
  });
}

async function bootCatalog(): Promise<void> {
  catalog = await api.catalog();
}

async function boot(): Promise<void> {
  const token = localStorage.getItem('cs2_token');
  if (token) {
    try {
      const r = await api.me();
      profile = r.profile;
      await bootCatalog();
      void enterMenu();
      return;
    } catch {
      setToken(null);
    }
  }
  bootAuth();
}

// 首次手势激活音频
const unlockAudio = (): void => {
  game?.audio.ensure();
  game?.audio.resume();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// ?debug 测试钩子（自动化验收用）
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).__cs = {
    getGame: () => game,
    killAll: () => {
      const g = game;
      if (!g) return 0;
      const list = [...g.enemyMgr.enemies];
      for (const e of list) if (e.alive) e.applyDamage(999999999, false);
      return list.length;
    },
    godMode: () => {
      if (game) game.player.hp = 99999;
    },
    // 快进：以固定 60fps 步长手动推进 n 帧（后台节流环境下的测试工具）
    // noRender=true 时跳过渲染，专用于逻辑推进
    fast: (frames: number, noRender = true) => {
      const g = game as unknown as { tick: (t: number) => void; lastT: number; __noRender?: boolean } | null;
      if (!g) return 0;
      g.__noRender = noRender;
      for (let i = 0; i < frames; i++) {
        g.lastT = performance.now() - 16.7;
        g.tick(performance.now());
      }
      g.__noRender = false;
      return frames;
    },
    ammo: () => {
      // 补满弹药
      const g = game;
      if (!g) return;
      void g;
    },
    state: () => {
      const g = game;
      if (!g) return null;
      return {
        running: g.campaign.state,
        wave: g.campaign.wave,
        kills: g.campaign.kills,
        alive: g.enemyMgr.aliveCount,
        hp: g.player.hp,
        gold: g.campaign.goldEarned,
      };
    },
  };
}

// THREE 副作用引用（防止 tree-shake 误判）
void THREE;

void boot();
