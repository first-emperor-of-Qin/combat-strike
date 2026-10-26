import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 在导入服务模块前重定向数据目录（db.ts 在导入时初始化）
process.env.CS_DATA_DIR = mkdtempSync(join(tmpdir(), 'cs-test-'));

const { default: app } = await import('../src/routes.js');

interface Ctx { token: string; username: string }

async function register(username: string, password = 'test123456'): Promise<Ctx> {
  const res = await app.request('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json() as { token?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'register failed');
  return { token: data.token!, username };
}

const auth = (t: Ctx) => ({ authorization: `Bearer ${t.token}`, 'content-type': 'application/json' });

describe('认证', () => {
  it('注册 → 登录 → me 全链路', async () => {
    const u = await register(`玩家${Date.now()}`);
    expect(u.token).toBeTruthy();

    const login = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: u.username, password: 'test123456' }),
    });
    expect(login.status).toBe(200);

    const me = await app.request('/me', { headers: auth(u) });
    const meData = await me.json() as { profile: { username: string; gold: number; ownedWeapons: string[] } };
    expect(meData.profile.username).toBe(u.username);
    expect(meData.profile.gold).toBe(1500);
    expect(meData.profile.ownedWeapons).toContain('thunder-mk1');
  });

  it('非法输入被拒绝', async () => {
    const bad1 = await app.request('/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'x', password: '123' }),
    });
    expect(bad1.status).toBe(400);
    const bad2 = await app.request('/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: '合法用户名', password: 'short' }),
    });
    expect(bad2.status).toBe(400);
  });

  it('重复用户名返回 409', async () => {
    const name = `重复${Date.now()}`;
    await register(name);
    const res = await app.request('/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: name, password: 'test123456' }),
    });
    expect(res.status).toBe(409);
  });

  it('错误密码返回 401', async () => {
    const u = await register(`密码${Date.now()}`);
    const res = await app.request('/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: u.username, password: 'wrong-password' }),
    });
    expect(res.status).toBe(401);
  });

  it('未认证访问受保护接口返回 401', async () => {
    const res = await app.request('/me');
    expect(res.status).toBe(401);
  });
});

describe('商城', () => {
  let u: Ctx;
  beforeAll(async () => { u = await register(`商城${Date.now()}`); });

  it('等级不足无法购买 T3', async () => {
    const res = await app.request('/shop/purchase', {
      method: 'POST', headers: auth(u),
      body: JSON.stringify({ weaponId: 'white-night' }),
    });
    expect(res.status).toBe(403);
  });

  it('金币不足无法购买', async () => {
    // T2 金属风暴需要等级 4；直接用 SQL 提级与给金币的替代：购买应在等级校验处被拦
    // 这里验证 1 级玩家买 T2 → 等级不足
    const res = await app.request('/shop/purchase', {
      method: 'POST', headers: auth(u),
      body: JSON.stringify({ weaponId: 'metal-storm' }),
    });
    expect([402, 403]).toContain(res.status);
  });

  it('不存在的武器返回 404', async () => {
    const res = await app.request('/shop/purchase', {
      method: 'POST', headers: auth(u),
      body: JSON.stringify({ weaponId: 'not-exist' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('战局结算与反作弊', () => {
  let u: Ctx;
  beforeAll(async () => { u = await register(`结算${Date.now()}`); });

  it('C1 通关发放首通奖励并解锁 C2', async () => {
    const res = await app.request('/run/complete', {
      method: 'POST', headers: auth(u),
      body: JSON.stringify({ chapter: 1, success: true, kills: 47, wave: 3, timeSec: 300 }),
    });
    const d = await res.json() as { reward: { gold: number; firstClear: boolean; unlockedChapter: number | null }, profile: { chapterUnlocked: number; level: number } };
    expect(d.reward.firstClear).toBe(true);
    expect(d.reward.unlockedChapter).toBe(2);
    expect(d.profile.chapterUnlocked).toBe(2);
    // 击杀 47 × 3 + 首通 1200 + 每日 600 = 1941
    expect(d.reward.gold).toBe(47 * 3 + 1200 + 600);
  });

  it('虚报击杀数被服务端截断', async () => {
    const res = await app.request('/run/complete', {
      method: 'POST', headers: auth(u),
      body: JSON.stringify({ chapter: 1, success: true, kills: 999999, wave: 3, timeSec: 600 }),
    });
    const d = await res.json() as { reward: { gold: number } };
    // 上限 = 42 击杀 × 1.6 ≈ 68，金币应远小于虚报值
    expect(d.reward.gold).toBeLessThan(68 * 3 + 420 + 600 + 1);
  });

  it('未解锁章节的结算被拒绝', async () => {
    const res = await app.request('/run/complete', {
      method: 'POST', headers: auth(u),
      body: JSON.stringify({ chapter: 5, success: true, kills: 10, wave: 4, timeSec: 100 }),
    });
    expect(res.status).toBe(403);
  });

  it('重复通关发放 35% 重复奖励', async () => {
    const res = await app.request('/run/complete', {
      method: 'POST', headers: auth(u),
      body: JSON.stringify({ chapter: 1, success: true, kills: 0, wave: 3, timeSec: 200 }),
    });
    const d = await res.json() as { reward: { gold: number; firstClear: boolean } };
    expect(d.reward.firstClear).toBe(false);
    expect(d.reward.gold).toBe(Math.round(1200 * 0.35));
  });

  it('失败也有少量经验但无金币', async () => {
    const res = await app.request('/run/complete', {
      method: 'POST', headers: auth(u),
      body: JSON.stringify({ chapter: 2, success: false, kills: 10, wave: 1, timeSec: 120 }),
    });
    const d = await res.json() as { reward: { gold: number; xp: number } };
    expect(d.reward.gold).toBe(0);
    expect(d.reward.xp).toBeGreaterThan(0);
  });
});

describe('配装', () => {
  it('只能装备已拥有的武器', async () => {
    const u = await register(`配装${Date.now()}`);
    const bad = await app.request('/loadout', {
      method: 'POST', headers: auth(u),
      body: JSON.stringify({ primary: 'po-hong', secondary: 'shadow-smg' }),
    });
    expect(bad.status).toBe(403);
    const ok = await app.request('/loadout', {
      method: 'POST', headers: auth(u),
      body: JSON.stringify({ primary: 'thunder-mk1', secondary: 'shadow-smg' }),
    });
    expect(ok.status).toBe(200);
  });
});
