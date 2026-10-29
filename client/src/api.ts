import type { AuthResponse, Profile, RunReward, WeaponDef, ChapterDef, BossInfo } from '@combat-strike/shared';

export interface Catalog { weapons: WeaponDef[]; chapters: ChapterDef[]; bosses: Record<number, BossInfo> }

/**
 * API 客户端。
 * 服务端不可达时自动进入「离线试玩模式」：档案保存在 localStorage，
 * 结算奖励按同一套公式在本地计算（数据结构与在线模式完全一致）。
 */

const TOKEN_KEY = 'cs2_token';
const DEMO_KEY = 'cs2_demo_profile';

let token: string | null = null;
export let offlineMode = false;

export function isOffline(): boolean { return offlineMode; }

function getToken(): string | null {
  if (token === null) token = localStorage.getItem(TOKEN_KEY);
  return token;
}

export function setToken(t: string | null): void {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  const res = await fetch(`/api${path}`, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `请求失败 (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export class ApiError extends Error {
  status: number;
  constructor(msg: string, status: number) { super(msg); this.status = status; }
}

// ============================================================
// 离线试玩档案（服务端不可达时的降级体验）
// ============================================================
interface DemoState { profile: Profile }

function loadDemo(): DemoState | null {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? JSON.parse(raw) as DemoState : null;
  } catch { return null; }
}

function saveDemo(profile: Profile): void {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify({ profile })); } catch { /* ignore */ }
}

function emptyDemoProfile(): Profile {
  return {
    id: 0, username: '访客', level: 1, xp: 0, gold: 1500, createdAt: Date.now(),
    ownedWeapons: ['thunder-mk1', 'shadow-smg'],
    upgrades: {},
    loadout: { primary: 'thunder-mk1', secondary: 'shadow-smg' },
    chapterUnlocked: 1, chapterCleared: [],
    stats: { kills: 0, deaths: 0, runs: 0, bestWave: 0, playtimeSec: 0 },
  };
}

/** 离线模式下的本地结算（公式与服务端一致） */
function offlineCompleteRun(chapter: number, success: boolean, kills: number, wave: number, timeSec: number, catalog: { weapons: WeaponDef[]; chapters: ChapterDef[] }): { reward: RunReward; profile: Profile } {
  const st = loadDemo();
  const profile = st?.profile ?? emptyDemoProfile();
  const firstClear = success && !profile.chapterCleared.includes(chapter);
  const killGoldVal = Math.max(1, Math.round(3 * Math.pow(1.95, chapter - 1)));
  let gold = 0;
  if (success) {
    gold += kills * killGoldVal;
    gold += firstClear ? Math.round(1200 * Math.pow(2.2, chapter - 1)) : Math.round(1200 * Math.pow(2.2, chapter - 1) * 0.35);
  }
  const xp = Math.round(kills * 3 + (success ? 150 * Math.pow(chapter, 1.6) : 150 * Math.pow(chapter, 1.6) * 0.25));
  let cur = profile.xp + xp;
  let level = profile.level;
  const levelUp = false;
  while (level < 60 && cur >= Math.round(80 * Math.pow(level, 1.4))) {
    cur -= Math.round(80 * Math.pow(level, 1.4));
    level += 1;
  }
  profile.xp = cur; profile.level = level; profile.gold += gold;
  profile.stats.kills += kills; profile.stats.runs += 1;
  profile.stats.bestWave = Math.max(profile.stats.bestWave, wave);
  profile.stats.playtimeSec += timeSec;
  let unlockedChapter: number | null = null;
  if (success && firstClear) {
    profile.chapterCleared.push(chapter);
    const next = chapter + 1;
    if (next <= catalog.chapters.length) { profile.chapterUnlocked = Math.max(profile.chapterUnlocked, next); unlockedChapter = next; }
  }
  saveDemo(profile);
  return { reward: { gold, xp, levelUp, newLevel: level, firstClear, dailyFirst: false, unlockedChapter }, profile };
}

// ============================================================
// 公开 API
// ============================================================
export const api = {
  async register(username: string, password: string): Promise<AuthResponse> {
    try {
      const r = await request<AuthResponse>('POST', '/auth/register', { username, password });
      setToken(r.token); offlineMode = false;
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) throw e;
      offlineMode = true;
      const st = loadDemo();
      const profile = st?.profile ?? emptyDemoProfile();
      profile.username = username; saveDemo(profile);
      return { token: 'demo', profile };
    }
  },

  async login(username: string, password: string): Promise<AuthResponse> {
    try {
      const r = await request<AuthResponse>('POST', '/auth/login', { username, password });
      setToken(r.token); offlineMode = false;
      return r;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) throw e;
      offlineMode = true;
      const st = loadDemo();
      const profile = st?.profile ?? emptyDemoProfile();
      profile.username = username; saveDemo(profile);
      return { token: 'demo', profile };
    }
  },

  async me(): Promise<{ profile: Profile; xpNeeded: number; maxHp: number }> {
    if (offlineMode || getToken() === 'demo') {
      const st = loadDemo();
      const profile = st?.profile ?? emptyDemoProfile();
      return { profile, xpNeeded: Math.round(80 * Math.pow(profile.level, 1.4)), maxHp: 100 + profile.level * 2 };
    }
    return request('GET', '/me');
  },

  async catalog(): Promise<Catalog> {
    try {
      return await request('GET', '/catalog');
    } catch {
      // 离线降级：直接 import shared 数据（构建期内联）
      const shared = await import('@combat-strike/shared');
      return { weapons: shared.WEAPONS, chapters: shared.CHAPTERS, bosses: shared.BOSS_NAMES };
    }
  },

  async purchase(weaponId: string): Promise<{ profile: Profile }> {
    if (offlineMode || getToken() === 'demo') {
      const st = loadDemo();
      const profile = st?.profile ?? emptyDemoProfile();
      const shared = await import('@combat-strike/shared');
      const w = shared.WEAPON_MAP.get(weaponId);
      if (!w) throw new ApiError('武器不存在', 404);
      if (profile.ownedWeapons.includes(weaponId)) throw new ApiError('已拥有该武器', 409);
      if (profile.level < w.reqLevel) throw new ApiError(`需要账号等级 ${w.reqLevel}`, 403);
      if (profile.gold < w.price) throw new ApiError('金币不足', 402);
      profile.gold -= w.price;
      profile.ownedWeapons.push(weaponId);
      saveDemo(profile);
      return { profile };
    }
    return request('POST', '/shop/purchase', { weaponId });
  },

  async upgrade(weaponId: string): Promise<{ profile: Profile; upgradedTo: number; cost: number }> {
    if (offlineMode || getToken() === 'demo') {
      const st = loadDemo();
      const profile = st?.profile ?? emptyDemoProfile();
      const shared = await import('@combat-strike/shared');
      const w = shared.WEAPON_MAP.get(weaponId);
      if (!w) throw new ApiError('武器不存在', 404);
      if (!profile.ownedWeapons.includes(weaponId)) throw new ApiError('未拥有该武器', 403);
      const cur = profile.upgrades[weaponId] ?? 0;
      if (cur >= shared.UPGRADE_MAX) throw new ApiError('已达到最高强化等级', 409);
      const cost = shared.upgradeCost(w.tier, cur);
      if (profile.gold < cost) throw new ApiError('金币不足', 402);
      profile.gold -= cost;
      profile.upgrades[weaponId] = cur + 1;
      saveDemo(profile);
      return { profile, upgradedTo: cur + 1, cost };
    }
    return request('POST', '/shop/upgrade', { weaponId });
  },

  async saveLoadout(primary: string | null, secondary: string | null): Promise<{ profile: Profile }> {
    if (offlineMode || getToken() === 'demo') {
      const st = loadDemo();
      const profile = st?.profile ?? emptyDemoProfile();
      profile.loadout = { primary, secondary };
      saveDemo(profile);
      return { profile };
    }
    return request('POST', '/loadout', { primary, secondary });
  },

  async completeRun(chapter: number, success: boolean, kills: number, wave: number, timeSec: number, catalog?: { weapons: WeaponDef[]; chapters: ChapterDef[] }): Promise<{ reward: RunReward; profile: Profile }> {
    if (offlineMode || getToken() === 'demo') {
      const shared = catalog ?? await import('@combat-strike/shared');
      return offlineCompleteRun(chapter, success, kills, wave, timeSec, shared as { weapons: WeaponDef[]; chapters: ChapterDef[] });
    }
    return request('POST', '/run/complete', { chapter, success, kills, wave, timeSec });
  },
};
