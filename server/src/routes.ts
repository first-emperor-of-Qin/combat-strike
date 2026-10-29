import { Hono } from 'hono';
import { db, initNewUser } from './db.js';
import {
  hashPassword, verifyPassword, signToken, requireAuth, validateCredentials, type Env,
} from './auth.js';
import {
  WEAPONS, WEAPON_MAP, CHAPTERS, BOSS_NAMES,
  killGold, firstClearGold, replayClearGold, clearXp, xpForLevel, playerMaxHp,
  waveComposition, upgradeCost, UPGRADE_MAX,
} from '@combat-strike/shared';
import type { Profile, RunReward } from '@combat-strike/shared';

const app = new Hono<Env>();

/** SQLite 行 → 强类型行（node:sqlite 返回宽类型） */
function row<T>(r: unknown): T {
  return r as T;
}

// ============================================================
// 档案装配
// ============================================================
const LEVEL_CAP = 60;

interface UserRow {
  id: number; username: string; pass_hash: string;
  level: number; xp: number; gold: number; created_at: number;
}

interface ProgressRow {
  chapter_unlocked: number; chapter_cleared: string;
  kills: number; deaths: number; runs: number; best_wave: number; playtime_sec: number;
}

function getProgressRow(uid: number): ProgressRow | undefined {
  return row<ProgressRow | undefined>(
    db.prepare(
      'SELECT chapter_unlocked, chapter_cleared, kills, deaths, runs, best_wave, playtime_sec FROM progress WHERE user_id = ?',
    ).get(uid),
  );
}

function buildProfile(user: UserRow): Profile {
  const p = getProgressRow(user.id);
  const owned = row<{ weapon_id: string; level: number }[]>(
    db.prepare('SELECT weapon_id, level FROM user_weapons WHERE user_id = ?').all(user.id),
  );
  const lo = row<{ primary_w: string | null; secondary_w: string | null } | undefined>(
    db.prepare('SELECT primary_w, secondary_w FROM loadout WHERE user_id = ?').get(user.id),
  );
  return {
    id: user.id,
    username: user.username,
    level: user.level,
    xp: user.xp,
    gold: user.gold,
    createdAt: user.created_at,
    ownedWeapons: owned.map((r) => r.weapon_id),
    upgrades: Object.fromEntries(owned.map((r) => [r.weapon_id, r.level])),
    loadout: { primary: lo?.primary_w ?? null, secondary: lo?.secondary_w ?? null },
    chapterUnlocked: p?.chapter_unlocked ?? 1,
    chapterCleared: JSON.parse(p?.chapter_cleared ?? '[]') as number[],
    stats: {
      kills: p?.kills ?? 0, deaths: p?.deaths ?? 0, runs: p?.runs ?? 0,
      bestWave: p?.best_wave ?? 0, playtimeSec: p?.playtime_sec ?? 0,
    },
  };
}

function grantXp(user: UserRow, xp: number): { levelUp: boolean; newLevel: number; bonusGold: number } {
  let level = user.level;
  let cur = user.xp + xp;
  let levelUp = false;
  while (level < LEVEL_CAP && cur >= xpForLevel(level)) {
    cur -= xpForLevel(level);
    level += 1;
    levelUp = true;
  }
  if (level >= LEVEL_CAP) cur = Math.min(cur, xpForLevel(LEVEL_CAP));
  const bonusGold = levelUp ? 300 * level : 0; // 升级奖励
  db.prepare('UPDATE users SET level = ?, xp = ?, gold = gold + ? WHERE id = ?').run(level, cur, bonusGold, user.id);
  user.level = level; user.xp = cur; user.gold += bonusGold;
  return { levelUp, newLevel: level, bonusGold };
}

function getUser(uid: number): UserRow | undefined {
  return row<UserRow | undefined>(db.prepare('SELECT * FROM users WHERE id = ?').get(uid));
}

// ============================================================
// 认证
// ============================================================
app.post('/auth/register', async (c) => {
  const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  const err = body && validateCredentials(body.username, body.password);
  if (err) return c.json({ error: err }, 400);
  const username = body!.username as string;
  const password = body!.password as string;

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return c.json({ error: '该用户名已被注册' }, 409);

  const result = db.prepare(
    'INSERT INTO users (username, pass_hash, created_at) VALUES (?, ?, ?)',
  ).run(username, hashPassword(password), Date.now());
  const uid = Number(result.lastInsertRowid);
  initNewUser(uid);

  const user = getUser(uid)!;
  const token = await signToken(uid, username);
  return c.json({ token, profile: buildProfile(user) }, 201);
});

app.post('/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
    return c.json({ error: '请输入用户名与密码' }, 400);
  }
  const user = row<UserRow | undefined>(
    db.prepare('SELECT * FROM users WHERE username = ?').get(body.username),
  );
  if (!user || !verifyPassword(body.password, user.pass_hash)) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }
  const token = await signToken(user.id, user.username);
  return c.json({ token, profile: buildProfile(user) });
});

// ============================================================
// 静态目录（武器/章节 —— 客户端渲染用）
// ============================================================
app.get('/catalog', (c) => {
  return c.json({
    weapons: WEAPONS,
    chapters: CHAPTERS,
    bosses: BOSS_NAMES,
    maxHpByLevel: Object.fromEntries(
      Array.from({ length: LEVEL_CAP }, (_, i) => [i + 1, playerMaxHp(i + 1)]),
    ),
  });
});

// ============================================================
// 需要登录的路由
// ============================================================
app.use('/me', requireAuth);
app.use('/shop/*', requireAuth);
app.use('/loadout', requireAuth);
app.use('/run/*', requireAuth);

app.get('/me', (c) => {
  const user = getUser(c.get('uid'));
  if (!user) return c.json({ error: '用户不存在' }, 404);
  return c.json({ profile: buildProfile(user), xpNeeded: xpForLevel(user.level), maxHp: playerMaxHp(user.level) });
});

// ---- 商城购买 ----
app.post('/shop/purchase', async (c) => {
  const body = await c.req.json().catch(() => null) as { weaponId?: unknown } | null;
  if (!body || typeof body.weaponId !== 'string') return c.json({ error: '参数错误' }, 400);
  const w = WEAPON_MAP.get(body.weaponId);
  if (!w) return c.json({ error: '武器不存在' }, 404);

  const uid = c.get('uid');
  const user = getUser(uid);
  if (!user) return c.json({ error: '用户不存在' }, 404);

  const owned = db.prepare('SELECT 1 FROM user_weapons WHERE user_id = ? AND weapon_id = ?').get(uid, w.id);
  if (owned) return c.json({ error: '已拥有该武器' }, 409);
  if (user.level < w.reqLevel) return c.json({ error: `需要账号等级 ${w.reqLevel}` }, 403);
  if (user.gold < w.price) return c.json({ error: '金币不足' }, 402);

  db.prepare('UPDATE users SET gold = gold - ? WHERE id = ?').run(w.price, uid);
  db.prepare('INSERT INTO user_weapons (user_id, weapon_id, acquired_at) VALUES (?, ?, ?)').run(uid, w.id, Date.now());
  user.gold -= w.price;
  return c.json({ profile: buildProfile(user) });
});

// ---- 武器强化 ----
app.post('/shop/upgrade', async (c) => {
  const body = await c.req.json().catch(() => null) as { weaponId?: unknown } | null;
  if (!body || typeof body.weaponId !== 'string') return c.json({ error: '参数错误' }, 400);
  const w = WEAPON_MAP.get(body.weaponId);
  if (!w) return c.json({ error: '武器不存在' }, 404);

  const uid = c.get('uid');
  const user = getUser(uid);
  if (!user) return c.json({ error: '用户不存在' }, 404);

  const cur = row<{ level: number } | undefined>(
    db.prepare('SELECT level FROM user_weapons WHERE user_id = ? AND weapon_id = ?').get(uid, w.id),
  );
  if (!cur) return c.json({ error: '未拥有该武器' }, 403);
  if (cur.level >= UPGRADE_MAX) return c.json({ error: '已达到最高强化等级' }, 409);
  const cost = upgradeCost(w.tier, cur.level);
  if (user.gold < cost) return c.json({ error: '金币不足' }, 402);

  db.prepare('UPDATE users SET gold = gold - ? WHERE id = ?').run(cost, uid);
  db.prepare('UPDATE user_weapons SET level = level + 1 WHERE user_id = ? AND weapon_id = ?').run(uid, w.id);
  user.gold -= cost;
  return c.json({ profile: buildProfile(user), upgradedTo: cur.level + 1, cost });
});

// ---- 配装保存 ----
app.post('/loadout', async (c) => {
  const body = await c.req.json().catch(() => null) as { primary?: unknown; secondary?: unknown } | null;
  if (!body) return c.json({ error: '参数错误' }, 400);
  const uid = c.get('uid');

  const owned = new Set(
    row<{ weapon_id: string }[]>(
      db.prepare('SELECT weapon_id FROM user_weapons WHERE user_id = ?').all(uid),
    ).map((r) => r.weapon_id),
  );
  for (const key of ['primary', 'secondary'] as const) {
    const wid = body[key];
    if (wid === null || wid === undefined) continue;
    if (typeof wid !== 'string' || !owned.has(wid)) {
      return c.json({ error: `未拥有武器: ${String(wid)}` }, 403);
    }
  }
  const prim = typeof body.primary === 'string' ? body.primary : null;
  const sec = typeof body.secondary === 'string' ? body.secondary : null;
  db.prepare(
    `INSERT INTO loadout (user_id, primary_w, secondary_w) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET primary_w = excluded.primary_w, secondary_w = excluded.secondary_w`,
  ).run(uid, prim, sec);

  return c.json({ profile: buildProfile(getUser(uid)!) });
});

// ============================================================
// 战局结算 —— 服务端按公式计算奖励（客户端不可自定金额）
// ============================================================
const KILLS_PER_WAVE_SLACK = 1.6; // 反作弊冗余系数

app.post('/run/complete', async (c) => {
  const body = await c.req.json().catch(() => null) as
    | { chapter?: unknown; success?: unknown; kills?: unknown; wave?: unknown; timeSec?: unknown } | null;
  if (!body) return c.json({ error: '参数错误' }, 400);
  const uid = c.get('uid');

  const chapter = Number(body.chapter);
  const success = body.success === true;
  const kills = Math.max(0, Math.floor(Number(body.kills) || 0));
  const wave = Math.max(0, Math.floor(Number(body.wave) || 0));
  const timeSec = Math.min(7200, Math.max(0, Math.floor(Number(body.timeSec) || 0)));

  const chap = CHAPTERS.find((x) => x.id === chapter);
  if (!chap) return c.json({ error: '章节不存在' }, 400);

  const user = getUser(uid);
  if (!user) return c.json({ error: '用户不存在' }, 404);

  // ---- 章节解锁校验 ----
  const prog = getProgressRow(uid);
  const cleared = JSON.parse(prog?.chapter_cleared ?? '[]') as number[];
  if (chapter > 1 && !cleared.includes(chapter - 1)) {
    return c.json({ error: '章节尚未解锁' }, 403);
  }

  // ---- 击杀数上限校验 ----
  let maxKills = 0;
  for (let wv = 1; wv <= chap.waves; wv++) {
    const comp = waveComposition(chapter, wv, chap.waves);
    for (const n of Object.values(comp)) maxKills += n ?? 0;
  }
  if (BOSS_NAMES[chapter]) maxKills += 1;
  maxKills = Math.ceil(maxKills * KILLS_PER_WAVE_SLACK);
  const safeKills = Math.min(kills, maxKills);

  // ---- 奖励计算 ----
  const firstClear = success && !cleared.includes(chapter);
  const today = new Date().toISOString().slice(0, 10);
  const dailyRow = row<{ n: number }>(
    db.prepare(
      'SELECT COUNT(*) AS n FROM runs WHERE user_id = ? AND chapter = ? AND success = 1 AND created_at >= ?',
    ).get(uid, chapter, new Date(`${today}T00:00:00.000Z`).getTime()),
  );
  const dailyFirst = success && dailyRow.n === 0;

  let gold = 0;
  if (success) {
    gold += safeKills * killGold(chapter);
    gold += firstClear ? firstClearGold(chapter) : replayClearGold(chapter);
    if (dailyFirst) gold += Math.round(firstClearGold(chapter) * 0.5);
  }
  const xpGain = Math.round(safeKills * 3 + (success ? clearXp(chapter) : clearXp(chapter) * 0.25));

  // ---- 落库 ----
  const xpResult = grantXp(user, xpGain);
  db.prepare('UPDATE users SET gold = gold + ? WHERE id = ?').run(gold, uid);
  db.prepare(
    'INSERT INTO runs (user_id, chapter, success, kills, wave, gold, xp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(uid, chapter, success ? 1 : 0, safeKills, wave, gold, xpGain, Date.now());
  db.prepare(
    'UPDATE progress SET kills = kills + ?, runs = runs + 1, best_wave = MAX(best_wave, ?), playtime_sec = playtime_sec + ? WHERE user_id = ?',
  ).run(safeKills, wave, timeSec, uid);

  let unlockedChapter: number | null = null;
  if (success && firstClear) {
    cleared.push(chapter);
    db.prepare('UPDATE progress SET chapter_cleared = ? WHERE user_id = ?').run(JSON.stringify(cleared), uid);
    const next = chapter + 1;
    if (next <= CHAPTERS.length) {
      db.prepare('UPDATE progress SET chapter_unlocked = MAX(chapter_unlocked, ?) WHERE user_id = ?').run(next, uid);
      unlockedChapter = next;
    }
  }

  user.gold += gold;
  const reward: RunReward = {
    gold, xp: xpGain,
    levelUp: xpResult.levelUp, newLevel: xpResult.newLevel,
    firstClear, dailyFirst, unlockedChapter,
  };
  return c.json({ reward, profile: buildProfile(user) });
});

export default app;
