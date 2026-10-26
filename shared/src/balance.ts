import type { ChapterDef, EnemyDef, EnemyKind, Tier, WeaponDef } from './types.js';

// ============================================================
// 平衡公式 —— 全游戏数值的单一出处。
// 设计目标：C 章对应 T 级武器（DPS 约 110 × 1.55^(T-1)），
// 敌人生命 55 × 1.8^(C-1)，玩家在同级装备下单杀杂兵 ≈ 1 秒。
// ============================================================

/** 品级 DPS 曲线基准（T1 ≈ 110） */
export function tierDps(tier: Tier): number {
  return 110 * Math.pow(1.55, tier - 1);
}

/** 武器购买价（T1 免费，此后 2.35 倍等比） */
export function tierPrice(tier: Tier): number {
  if (tier <= 1) return 0;
  return Math.round((2500 * Math.pow(2.35, tier - 2)) / 100) * 100;
}

/** 购买武器所需账号等级 */
export function tierReqLevel(tier: Tier): number {
  return Math.max(1, tier * 3 - 2);
}

/** 章节杂兵基准生命（grunt） */
export function chapterGruntHp(chapter: number): number {
  return Math.round(55 * Math.pow(1.8, chapter - 1));
}

/** 敌人金币奖励随章节缩放 */
export function killGold(chapter: number): number {
  return Math.max(1, Math.round(3 * Math.pow(1.95, chapter - 1)));
}

/** 章节首次通关金币 */
export function firstClearGold(chapter: number): number {
  return Math.round(1200 * Math.pow(2.2, chapter - 1));
}

/** 重复通关金币（首通的 35%） */
export function replayClearGold(chapter: number): number {
  return Math.round(firstClearGold(chapter) * 0.35);
}

/** 通关经验 */
export function clearXp(chapter: number): number {
  return Math.round(150 * Math.pow(chapter, 1.6));
}

/** 升到 level 所需经验（本级内） */
export function xpForLevel(level: number): number {
  return Math.round(80 * Math.pow(level, 1.4));
}

/** 玩家最大生命 = 100 + 等级 × 2 */
export function playerMaxHp(level: number): number {
  return 100 + level * 2;
}

/** 波次敌人数量：基础 + 章节与波次递增，封顶 */
export function waveEnemyCount(chapter: number, wave: number, kind: EnemyKind): number {
  const base = 6 + chapter * 2 + wave * 2;
  const mult: Record<EnemyKind, number> = {
    grunt: 1, runner: 0.45, ranged: 0.35, heavy: 0.18,
    bomber: 0.15, drone: 0.25, elite: 0.1, boss: 0,
  };
  return Math.max(kind === 'grunt' ? 3 : 0, Math.round(base * mult[kind]));
}

/** 波次中各敌人是否出现（按章节解锁） */
export function waveComposition(chapter: number, wave: number, waves: number): Partial<Record<EnemyKind, number>> {
  const plan: Partial<Record<EnemyKind, number>> = {};
  plan.grunt = waveEnemyCount(chapter, wave, 'grunt');
  if (chapter >= 1 && wave >= 2) plan.runner = waveEnemyCount(chapter, wave, 'runner');
  if (chapter >= 2 && wave >= 1) plan.ranged = waveEnemyCount(chapter, wave, 'ranged');
  if (chapter >= 3 && wave >= 2) plan.heavy = waveEnemyCount(chapter, wave, 'heavy');
  if (chapter >= 4 && wave >= 2) plan.bomber = waveEnemyCount(chapter, wave, 'bomber');
  if (chapter >= 5 && wave >= 1) plan.drone = waveEnemyCount(chapter, wave, 'drone');
  if (chapter >= 6 && wave >= waves) plan.elite = Math.max(1, Math.round(chapter / 3));
  return plan;
}

// ============================================================
// 章节（9 章对应武器 1-9 级）
// ============================================================
export const CHAPTERS: ChapterDef[] = [
  { id: 1, name: '废弃军械库', enName: 'Armory Bunker', subtitle: '风暴前夜 · 清剿残党', theme: 'bunker',
    waves: 3, suggestedLevel: 1,
    skyColor: '#2b2620', fogColor: '#262119', fogDensity: 0.012,
    sunColor: '#ffd9a0', sunIntensity: 1.6, ambientColor: '#4a4238', ambientIntensity: 0.7,
    groundColor: '#3a342c', wallColor: '#2c2721', accentColor: '#ff9a3c' },
  { id: 2, name: '霓虹都会', enName: 'Neon City', subtitle: '雨夜追猎 · 帮派火并', theme: 'neon',
    waves: 3, suggestedLevel: 5,
    skyColor: '#0b0d1c', fogColor: '#0c1024', fogDensity: 0.014,
    sunColor: '#8ea8ff', sunIntensity: 0.8, ambientColor: '#26284a', ambientIntensity: 0.8,
    groundColor: '#171a26', wallColor: '#11131f', accentColor: '#22e0ff' },
  { id: 3, name: '极地前哨', enName: 'Polar Outpost', subtitle: '寒霜巨兽 · 冰原突围', theme: 'polar',
    waves: 4, suggestedLevel: 9,
    skyColor: '#c8d8e8', fogColor: '#b8c8da', fogDensity: 0.02,
    sunColor: '#eaf2ff', sunIntensity: 1.8, ambientColor: '#7c8ca0', ambientIntensity: 0.9,
    groundColor: '#dfe8f2', wallColor: '#8fa2b5', accentColor: '#4fc3ff' },
  { id: 4, name: '赤沙要塞', enName: 'Desert Fortress', subtitle: '黄昏攻坚 · 沙暴压境', theme: 'desert',
    waves: 4, suggestedLevel: 13,
    skyColor: '#c77b3a', fogColor: '#b06a30', fogDensity: 0.011,
    sunColor: '#ffc178', sunIntensity: 2.0, ambientColor: '#7a4c28', ambientIntensity: 0.75,
    groundColor: '#b98a52', wallColor: '#8a6238', accentColor: '#ffcf5c' },
  { id: 5, name: '深渊矿洞', enName: 'Abyss Mine', subtitle: '黑暗降临 · 矿道伏击', theme: 'mine',
    waves: 4, suggestedLevel: 17,
    skyColor: '#0a0a0d', fogColor: '#07070a', fogDensity: 0.03,
    sunColor: '#a0b8c8', sunIntensity: 0.35, ambientColor: '#20242c', ambientIntensity: 0.5,
    groundColor: '#26262c', wallColor: '#1a1a20', accentColor: '#59ffa2' },
  { id: 6, name: '熔炉之心', enName: 'Furnace Core', subtitle: '熔岩魔像 · 高温试炼', theme: 'furnace',
    waves: 5, suggestedLevel: 21,
    skyColor: '#200806', fogColor: '#2a0c06', fogDensity: 0.018,
    sunColor: '#ff9a5c', sunIntensity: 1.1, ambientColor: '#54201a', ambientIntensity: 0.9,
    groundColor: '#33201a', wallColor: '#241412', accentColor: '#ff5c22' },
  { id: 7, name: '轨道空间站', enName: 'Orbital Station', subtitle: '零重力走廊 · 舰桥攻防', theme: 'orbital',
    waves: 5, suggestedLevel: 25,
    skyColor: '#04070f', fogColor: '#050810', fogDensity: 0.008,
    sunColor: '#cfe4ff', sunIntensity: 1.5, ambientColor: '#2a3a55', ambientIntensity: 0.7,
    groundColor: '#2a313c', wallColor: '#1d232c', accentColor: '#7aa8ff' },
  { id: 8, name: '虚空裂隙', enName: 'Void Rift', subtitle: '现实崩解 · 异界回响', theme: 'void',
    waves: 5, suggestedLevel: 29,
    skyColor: '#0d0618', fogColor: '#120826', fogDensity: 0.016,
    sunColor: '#c49aff', sunIntensity: 0.9, ambientColor: '#33164f', ambientIntensity: 0.9,
    groundColor: '#1c1030', wallColor: '#140b22', accentColor: '#b26bff' },
  { id: 9, name: '奇点要塞', enName: 'Singularity Citadel', subtitle: '终局决战 · 虚数主宰', theme: 'citadel',
    waves: 5, suggestedLevel: 33,
    skyColor: '#06121a', fogColor: '#071620', fogDensity: 0.012,
    sunColor: '#8ff5ff', sunIntensity: 1.2, ambientColor: '#123a44', ambientIntensity: 0.8,
    groundColor: '#0e242e', wallColor: '#0a1a22', accentColor: '#7df9ff' },
];

/** 拥有 BOSS 的章节 */
export const BOSS_CHAPTERS: Record<number, string> = {
  3: '寒霜巨兽',
  6: '熔岩魔像',
  9: '虚数主宰',
};

// ============================================================
// 敌人（1 章基准值，章节缩放系数在运行时应用）
// ============================================================
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt:  { kind: 'grunt',  name: '突击兵',   hp: 55,  damage: 10, speed: 3.2, attackInterval: 1.1, attackRange: 1.9,  gold: 1, xp: 2, radius: 0.42, height: 1.8 },
  runner: { kind: 'runner', name: '疾冲者',   hp: 30,  damage: 8,  speed: 5.6, attackInterval: 0.9, attackRange: 1.8,  gold: 1, xp: 2, radius: 0.36, height: 1.6 },
  ranged: { kind: 'ranged', name: '电浆射手', hp: 44,  damage: 9,  speed: 2.4, attackInterval: 2.2, attackRange: 26,   gold: 2, xp: 3, radius: 0.42, height: 1.8 },
  heavy:  { kind: 'heavy',  name: '重装卫兵', hp: 165, damage: 18, speed: 2.1, attackInterval: 1.6, attackRange: 2.2,  gold: 4, xp: 6, radius: 0.55, height: 2.1 },
  bomber: { kind: 'bomber', name: '自爆蜂群', hp: 38,  damage: 24, speed: 4.6, attackInterval: 1.0, attackRange: 1.6,  gold: 2, xp: 4, radius: 0.38, height: 1.5 },
  drone:  { kind: 'drone',  name: '猎杀浮雷', hp: 22,  damage: 7,  speed: 4.2, attackInterval: 1.8, attackRange: 18,   gold: 2, xp: 3, radius: 0.35, height: 0.9 },
  elite:  { kind: 'elite',  name: '精英近卫', hp: 275, damage: 26, speed: 3.4, attackInterval: 1.2, attackRange: 2.4,  gold: 10, xp: 15, radius: 0.55, height: 2.2 },
  boss:   { kind: 'boss',   name: 'BOSS',     hp: 880, damage: 30, speed: 2.6, attackInterval: 1.5, attackRange: 3.0,  gold: 0, xp: 0, radius: 1.4, height: 4.2 },
};

/** 敌人生命随章节的倍率（相对基准） */
export function enemyHpMult(chapter: number): number {
  return Math.pow(1.8, chapter - 1);
}

/** 敌人伤害随章节的倍率 */
export function enemyDamageMult(chapter: number): number {
  return Math.pow(1.32, chapter - 1);
}

/** 敌人种类生命相对 grunt 的倍率 */
export const KIND_HP_MULT: Record<EnemyKind, number> = {
  grunt: 1, runner: 0.55, ranged: 0.8, heavy: 3, bomber: 0.7, drone: 0.4, elite: 5, boss: 0,
};

/** BOSS 生命 = grunt 生命 × 该系数 */
export const BOSS_HP_MULT = 16;
