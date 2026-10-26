import { describe, it, expect } from 'vitest';
import {
  WEAPONS, WEAPON_MAP, DEFAULT_OWNED, CHAPTERS, ENEMIES,
  tierDps, tierPrice, tierReqLevel, chapterGruntHp, firstClearGold, replayClearGold,
  clearXp, xpForLevel, playerMaxHp, killGold, waveComposition, enemyHpMult,
} from '../src/index.js';

describe('武器目录', () => {
  it('共 18 把武器，覆盖 1-9 全品级', () => {
    expect(WEAPONS.length).toBe(18);
    const tiers = new Set(WEAPONS.map((w) => w.tier));
    expect(tiers.size).toBe(9);
    for (const t of [1, 2, 3, 4, 5, 6, 7, 8, 9]) expect(tiers.has(t as 1)).toBe(true);
  });

  it('id 唯一且映射完整', () => {
    const ids = new Set(WEAPONS.map((w) => w.id));
    expect(ids.size).toBe(WEAPONS.length);
    for (const w of WEAPONS) expect(WEAPON_MAP.get(w.id)).toBe(w);
  });

  it('每把武器数值在合法区间', () => {
    for (const w of WEAPONS) {
      expect(w.damage).toBeGreaterThan(0);
      expect(w.rpm).toBeGreaterThanOrEqual(40);
      expect(w.rpm).toBeLessThanOrEqual(1100);
      expect(w.mag).toBeGreaterThanOrEqual(5);
      expect(w.reloadTime).toBeGreaterThan(0.5);
      expect(w.headshotMult).toBeGreaterThanOrEqual(1);
      expect(w.reserveMags).toBeGreaterThanOrEqual(4);
      expect(w.adsSpread).toBeLessThan(w.hipSpread);
      expect(w.falloffStart).toBeLessThan(w.falloffEnd);
    }
  });

  it('理论 DPS 随品级总体递增（同级内允许 ±40% 波动）', () => {
    const dpsOf = (w: (typeof WEAPONS)[number]) =>
      w.pellets > 1 ? w.damage * w.pellets * (w.rpm / 60) : w.damage * (w.rpm / 60);
    for (let t = 2; t <= 9; t++) {
      const prev = WEAPONS.filter((w) => w.tier === t - 1).map(dpsOf);
      const cur = WEAPONS.filter((w) => w.tier === t).map(dpsOf);
      const prevMax = Math.max(...prev);
      const curMin = Math.min(...cur);
      // 下一级最弱武器不应低于上一级最强武器的 55%（爆发型武器允许偏低）
      expect(curMin).toBeGreaterThan(prevMax * 0.55);
    }
  });

  it('价格与等级需求随品级递增，T1 免费', () => {
    expect(WEAPON_MAP.get(DEFAULT_OWNED[0]!)!.price).toBe(0);
    expect(WEAPON_MAP.get(DEFAULT_OWNED[1]!)!.price).toBe(0);
    for (let t = 2; t <= 9; t++) {
      const ws = WEAPONS.filter((w) => w.tier === t);
      for (const w of ws) {
        expect(w.price).toBeGreaterThan(0);
        expect(w.reqLevel).toBe(tierReqLevel(t));
      }
      const prev = WEAPONS.find((w) => w.tier === t - 1)!;
      expect(ws[0]!.price).toBeGreaterThan(prev.price);
    }
  });
});

describe('经济与成长公式', () => {
  it('章节敌人生命随章节指数增长', () => {
    for (let c = 2; c <= 9; c++) {
      expect(chapterGruntHp(c)).toBeGreaterThan(chapterGruntHp(c - 1));
    }
  });

  it('通关金币随章节增长，重复通关为 35%', () => {
    for (let c = 1; c <= 9; c++) {
      expect(replayClearGold(c)).toBe(Math.round(firstClearGold(c) * 0.35));
      if (c > 1) expect(firstClearGold(c)).toBeGreaterThan(firstClearGold(c - 1));
    }
  });

  it('升级曲线单调递增，满级生命合理', () => {
    for (let l = 2; l <= 60; l++) expect(xpForLevel(l)).toBeGreaterThan(xpForLevel(l - 1));
    expect(playerMaxHp(1)).toBe(102);
    expect(playerMaxHp(60)).toBe(220);
  });

  it('购买 T9 的金币约等于若干次 C9 通关（1-6 次）', () => {
    const t9 = WEAPONS.find((w) => w.tier === 9)!;
    const c9First = firstClearGold(9);
    const c9Replay = replayClearGold(9);
    expect(t9.price / c9Replay).toBeLessThan(6);
    expect(t9.price / c9First).toBeGreaterThan(0.5);
  });

  it('击杀金币随章节缩放', () => {
    expect(killGold(9)).toBeGreaterThan(killGold(1));
  });
});

describe('波次构成', () => {
  it('每章每波至少有杂兵，数量随章节/波次增加', () => {
    for (const ch of CHAPTERS) {
      for (let w = 1; w <= ch.waves; w++) {
        const comp = waveComposition(ch.id, w, ch.waves);
        expect((comp.grunt ?? 0)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('高级敌种按章节逐步解锁', () => {
    expect(waveComposition(1, 1, 3).ranged).toBeUndefined();
    expect(waveComposition(2, 1, 3).ranged).toBeGreaterThan(0);
    expect(waveComposition(1, 2, 3).runner).toBeGreaterThan(0);
    expect(waveComposition(3, 2, 4).heavy).toBeGreaterThan(0);
    expect(waveComposition(6, 5, 5).elite).toBeGreaterThan(0);
  });

  it('同级玩家可用 T 级武器在 ~1-2 秒内击杀同级杂兵', () => {
    for (let c = 1; c <= 9; c++) {
      const tier = Math.min(9, c) as 1;
      const weapons = WEAPONS.filter((w) => w.tier === tier);
      const gruntHp = chapterGruntHp(c);
      for (const w of weapons) {
        const dps = (w.pellets > 1 ? w.damage * w.pellets : w.damage) * (w.rpm / 60);
        const ttk = gruntHp / dps;
        expect(ttk, `${w.name} @ C${c} TTK=${ttk.toFixed(2)}s`).toBeLessThan(2.6);
        expect(ttk).toBeGreaterThan(0.25);
      }
    }
  });

  it('BOSS 章节配置正确', () => {
    expect(ENEMIES.boss.hp).toBeGreaterThan(0);
    expect(enemyHpMult(9)).toBeGreaterThan(enemyHpMult(1));
  });
});
