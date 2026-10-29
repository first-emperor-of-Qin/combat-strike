import type { Tier, WeaponDef } from './types.js';
import { tierPrice, tierReqLevel } from './balance.js';

// ============================================================
// 武器目录（18 款 · 9 品级 · 每把专属主动技能与被动）
// 名称延续初代枪战突击世界观，数值按平衡公式重做。
// 服务端权威数据，商城/军械库/局内共用。
// ============================================================

function weapon(w: Omit<WeaponDef, 'price' | 'reqLevel'>): WeaponDef {
  return { ...w, price: tierPrice(w.tier), reqLevel: tierReqLevel(w.tier) };
}

export const WEAPONS: WeaponDef[] = [
  // ---- T1 ----
  weapon({
    id: 'thunder-mk1', name: '雷霆之怒 MK-I', enName: 'Thunder MK-I', tier: 1, class: 'pistol',
    damage: 25, rpm: 250, mag: 12, reserveMags: 8, reloadTime: 1.3,
    hipSpread: 1.6, adsSpread: 0.35, bloom: 0.28, recoilV: 0.85, recoilH: 0.3,
    falloffStart: 22, falloffEnd: 45, falloffMin: 0.55, headshotMult: 2.0,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 1.0, adsZoom: 1.25,
    desc: '制式配发的高可靠半自动手枪，每一发都物尽其用。', accent: '#9aa3ad',
    element: 'lightning',
    skill: { type: 'powerShot', name: '过载弹', cooldown: 9, desc: '接下来 3 发子弹伤害 ×3 并贯穿敌人' },
    passive: { name: '爆头 ×2', desc: '爆头伤害倍率提升至 2.0' },
  }),
  weapon({
    id: 'shadow-smg', name: '幽影冲锋枪', enName: 'Shadow SMG', tier: 1, class: 'smg',
    damage: 11, rpm: 780, mag: 32, reserveMags: 8, reloadTime: 1.8,
    hipSpread: 2.2, adsSpread: 0.9, bloom: 0.22, recoilV: 0.38, recoilH: 0.26,
    falloffStart: 14, falloffEnd: 30, falloffMin: 0.5, headshotMult: 1.6,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 1.02, adsZoom: 1.2,
    desc: '消音管与轻量化机匣，雨夜巷战的老朋友。', accent: '#9aa3ad',
    element: 'void',
    skill: { type: 'shadowstep', name: '影遁', cooldown: 14, desc: '4 秒内移速 +45%、受伤 -40%' },
    passive: { name: '掠影', desc: '每次击杀回复 3 点生命' },
  }),

  // ---- T2 ----
  weapon({
    id: 'metal-storm', name: '金属风暴', enName: 'Metal Storm', tier: 2, class: 'ar',
    damage: 17, rpm: 640, mag: 30, reserveMags: 7, reloadTime: 2.0,
    hipSpread: 2.4, adsSpread: 0.7, bloom: 0.18, recoilV: 0.55, recoilH: 0.3,
    falloffStart: 26, falloffEnd: 52, falloffMin: 0.6, headshotMult: 1.7,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 0.97, adsZoom: 1.35,
    desc: '制式突击步枪，射速与稳定性兼备的全能底盘。', accent: '#4caf50',
    element: 'none',
    skill: { type: 'overdrive', name: '弹幕风暴', cooldown: 12, desc: '4 秒内射速 +65%' },
    passive: { name: '稳定握把', desc: '连射击发扩张降低 30%' },
  }),
  weapon({
    id: 'shadow-asura', name: '暗影修罗', enName: 'Shadow Asura', tier: 2, class: 'shotgun',
    damage: 13, rpm: 95, mag: 6, reserveMags: 10, reloadTime: 2.6,
    hipSpread: 4.5, adsSpread: 2.8, bloom: 0.4, recoilV: 2.4, recoilH: 0.9,
    falloffStart: 7, falloffEnd: 16, falloffMin: 0.25, headshotMult: 1.4,
    pelletSpread: 3.2, pellets: 9, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 0.98, adsZoom: 1.1,
    desc: '泵动霰弹枪，近身一处齐射即是裁决。', accent: '#4caf50',
    element: 'void',
    skill: { type: 'fireNova', name: '修罗震爆', cooldown: 10, desc: '以自身为中心引爆暗影冲击波' },
    passive: { name: '近身嗜血', desc: '对 6 米内敌人造成伤害的 8% 转化为生命' },
  }),

  // ---- T3 ----
  weapon({
    id: 'white-night', name: '白夜铳刃', enName: 'White Night', tier: 3, class: 'dmr',
    damage: 62, rpm: 190, mag: 15, reserveMags: 6, reloadTime: 2.2,
    hipSpread: 3.0, adsSpread: 0.28, bloom: 0.3, recoilV: 1.6, recoilH: 0.35,
    falloffStart: 40, falloffEnd: 70, falloffMin: 0.75, headshotMult: 2.2,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 0.96, adsZoom: 2.4,
    desc: '精确射手步枪，白夜之下没有第二发。', accent: '#2f81f7',
    element: 'ice',
    skill: { type: 'frostField', name: '白夜领域', cooldown: 14, desc: '在准星处展开冰封领域，持续减速并冻伤敌人' },
    passive: { name: '冰霜弹头', desc: '命中使敌人减速 35%，持续 2 秒' },
  }),
  weapon({
    id: 'blood-shark', name: '血鲨神锯', enName: 'Blood Shark', tier: 3, class: 'lmg',
    damage: 11, rpm: 1000, mag: 90, reserveMags: 4, reloadTime: 3.6,
    hipSpread: 3.2, adsSpread: 1.3, bloom: 0.16, recoilV: 0.42, recoilH: 0.34,
    falloffStart: 22, falloffEnd: 44, falloffMin: 0.55, headshotMult: 1.5,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 0.86, adsZoom: 1.25,
    desc: '链锯供弹的压制机枪，弹幕即血海。', accent: '#2f81f7',
    element: 'none',
    skill: { type: 'overdrive', name: '血怒', cooldown: 15, desc: '5 秒内射速 +50% 且伤害的 6% 转化为生命' },
    passive: { name: '猎杀本能', desc: '每次击杀返还 3 发备弹' },
  }),

  // ---- T4 ----
  weapon({
    id: 'dragon-knight', name: '魔龙骑士', enName: 'Dragon Knight', tier: 4, class: 'ar',
    damage: 46, rpm: 560, mag: 35, reserveMags: 7, reloadTime: 2.1,
    hipSpread: 2.2, adsSpread: 0.6, bloom: 0.16, recoilV: 0.62, recoilH: 0.3,
    falloffStart: 28, falloffEnd: 56, falloffMin: 0.65, headshotMult: 1.8,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 0.97, adsZoom: 1.4,
    desc: '龙鳞复合装甲枪身，龙威附体的战场上位者。', accent: '#9b59f6',
    element: 'fire',
    skill: { type: 'fireNova', name: '龙息喷吐', cooldown: 11, desc: '向前方喷吐龙息，灼烧范围内敌人' },
    passive: { name: '龙鳞守护', desc: '受到的伤害降低 10%' },
  }),
  weapon({
    id: 'golden-duel', name: '黄金决斗', enName: 'Golden Duel', tier: 4, class: 'dmr',
    damage: 155, rpm: 150, mag: 8, reserveMags: 7, reloadTime: 2.4,
    hipSpread: 3.2, adsSpread: 0.22, bloom: 0.35, recoilV: 2.2, recoilH: 0.4,
    falloffStart: 45, falloffEnd: 80, falloffMin: 0.8, headshotMult: 2.3,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 0.95, adsZoom: 3.0,
    desc: '决斗者的高贵铅字，一发定胜负。', accent: '#9b59f6',
    element: 'holy',
    skill: { type: 'powerShot', name: '毁灭射击', cooldown: 10, desc: '接下来 2 发子弹伤害 ×4 并贯穿' },
    passive: { name: '致命磁能', desc: '对满血敌人的第一发伤害 +30%' },
  }),

  // ---- T5 ----
  weapon({
    id: 'zeus-hand', name: '宙斯之手', enName: 'Zeus Hand', tier: 5, class: 'energy',
    damage: 84, rpm: 490, mag: 40, reserveMags: 6, reloadTime: 2.2,
    hipSpread: 2.0, adsSpread: 0.55, bloom: 0.15, recoilV: 0.5, recoilH: 0.24,
    falloffStart: 30, falloffEnd: 60, falloffMin: 0.7, headshotMult: 1.9,
    pelletSpread: 0, pellets: 1, projectileSpeed: 170, blastRadius: 1.1, pierce: 1,
    moveMult: 0.97, adsZoom: 1.4,
    desc: '雷电能浆步枪，命中的位置会落下余雷。', accent: '#ffb020',
    element: 'lightning',
    skill: { type: 'chainLightning', name: '宙斯降临', cooldown: 10, desc: '召唤落雷在最多 6 名敌人之间跳跃' },
    passive: { name: '感电', desc: '命中使敌人麻痹，攻击前摇被打断' },
  }),
  weapon({
    id: 'judgement-flame', name: '裁决之炎', enName: 'Judgement Flame', tier: 5, class: 'shotgun',
    damage: 23, rpm: 170, mag: 12, reserveMags: 6, reloadTime: 2.8,
    hipSpread: 4.2, adsSpread: 2.4, bloom: 0.35, recoilV: 1.9, recoilH: 0.7,
    falloffStart: 8, falloffEnd: 18, falloffMin: 0.3, headshotMult: 1.5,
    pelletSpread: 3.4, pellets: 10, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 0.95, adsZoom: 1.1,
    desc: '自动装填的燃烧霰弹，红莲印记烧尽一切。', accent: '#ffb020',
    element: 'fire',
    skill: { type: 'fireNova', name: '红莲爆裂', cooldown: 9, desc: '引爆红莲新星，大范围灼烧' },
    passive: { name: '红莲印记', desc: '命中使敌人灼烧，3 秒内持续掉血' },
  }),

  // ---- T6 ----
  weapon({
    id: 'dawn-light', name: '黎明之光', enName: 'Dawn Light', tier: 6, class: 'lmg',
    damage: 77, rpm: 800, mag: 100, reserveMags: 4, reloadTime: 3.8,
    hipSpread: 3.0, adsSpread: 1.1, bloom: 0.13, recoilV: 0.44, recoilH: 0.3,
    falloffStart: 26, falloffEnd: 52, falloffMin: 0.6, headshotMult: 1.6,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 0.83, adsZoom: 1.3,
    desc: '晨曦能量的无限倾泻，黎明即火力。', accent: '#ff6a00',
    element: 'holy',
    skill: { type: 'healBurst', name: '黎明解放', cooldown: 16, desc: '治疗自身 35% 生命并灼伤周围敌人' },
    passive: { name: '圣光灌注', desc: '波次间休整时额外回复 20% 生命' },
  }),
  weapon({
    id: 'moon-bow', name: '皓月神弓', enName: 'Moon Bow', tier: 6, class: 'dmr',
    damage: 490, rpm: 120, mag: 10, reserveMags: 6, reloadTime: 2.5,
    hipSpread: 3.4, adsSpread: 0.16, bloom: 0.3, recoilV: 2.4, recoilH: 0.4,
    falloffStart: 50, falloffEnd: 90, falloffMin: 0.85, headshotMult: 2.5,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 2,
    moveMult: 0.94, adsZoom: 3.5,
    desc: '磁轨蓄能的月光长弓，一矢可贯三人。', accent: '#ff6a00',
    element: 'ice',
    skill: { type: 'barrage', name: '万箭齐发', cooldown: 12, desc: '射出 8 枚追踪冰晶箭矢' },
    passive: { name: '冰霜箭', desc: '命中使敌人减速 35%，持续 2 秒' },
  }),

  // ---- T7 ----
  weapon({
    id: 'parasite', name: '寄生者', enName: 'Parasite', tier: 7, class: 'sniper',
    damage: 2050, rpm: 48, mag: 5, reserveMags: 8, reloadTime: 3.0,
    hipSpread: 5.0, adsSpread: 0.05, bloom: 0.2, recoilV: 3.6, recoilH: 0.5,
    falloffStart: 60, falloffEnd: 120, falloffMin: 0.9, headshotMult: 2.8,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 0.9, adsZoom: 6.0,
    desc: '反器材狙击平台，寄生弹头在装甲内开花。', accent: '#ff3860',
    element: 'void',
    skill: { type: 'powerShot', name: '寄生爆发', cooldown: 12, desc: '接下来 1 发子弹伤害 ×5 并贯穿 3 人' },
    passive: { name: '内脏暴击', desc: '对生命低于 30% 的敌人伤害 +40%' },
  }),
  weapon({
    id: 'phantom', name: '魅影双持', enName: 'Phantom Twins', tier: 7, class: 'smg',
    damage: 98, rpm: 980, mag: 48, reserveMags: 7, reloadTime: 2.0,
    hipSpread: 2.4, adsSpread: 0.85, bloom: 0.14, recoilV: 0.4, recoilH: 0.3,
    falloffStart: 18, falloffEnd: 38, falloffMin: 0.55, headshotMult: 1.7,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 1,
    moveMult: 1.0, adsZoom: 1.25,
    desc: '双持电浆冲锋枪，魅影过处寸草不生。', accent: '#ff3860',
    element: 'lightning',
    skill: { type: 'blink', name: '相位闪现', cooldown: 8, desc: '向前瞬移 12 米并短暂无敌' },
    passive: { name: '电弧连锁', desc: '击杀时释放小型电弧冲击周围敌人' },
  }),

  // ---- T8 ----
  weapon({
    id: 'dimension-star', name: '次元之星', enName: 'Dimension Star', tier: 8, class: 'energy',
    damage: 300, rpm: 100, mag: 8, reserveMags: 6, reloadTime: 2.9,
    hipSpread: 4.0, adsSpread: 2.2, bloom: 0.3, recoilV: 2.0, recoilH: 0.6,
    falloffStart: 10, falloffEnd: 22, falloffMin: 0.4, headshotMult: 1.6,
    pelletSpread: 2.6, pellets: 8, projectileSpeed: 140, blastRadius: 0.8, pierce: 1,
    moveMult: 0.96, adsZoom: 1.15,
    desc: '八向次元散射炮，星屑在领域内折跃。', accent: '#ff4fd8',
    element: 'void',
    skill: { type: 'barrage', name: '次元散射', cooldown: 10, desc: '射出 10 枚追踪星屑弹' },
    passive: { name: '次元标记', desc: '被命中的敌人 4 秒内受到伤害 +15%' },
  }),
  weapon({
    id: 'yanmo-launcher', name: '炎魔灭世', enName: 'Yanmo Annihilator', tier: 8, class: 'launcher',
    damage: 1450, rpm: 100, mag: 6, reserveMags: 5, reloadTime: 3.2,
    hipSpread: 2.0, adsSpread: 0.8, bloom: 0.2, recoilV: 2.8, recoilH: 0.5,
    falloffStart: 30, falloffEnd: 60, falloffMin: 0.9, headshotMult: 1.0,
    pelletSpread: 0, pellets: 1, projectileSpeed: 40, blastRadius: 3.6, pierce: 1,
    moveMult: 0.92, adsZoom: 1.6,
    desc: '磁加速火箭巢，炎魔领域随弹头一同降临。', accent: '#ff4fd8',
    element: 'fire',
    skill: { type: 'fireNova', name: '炎魔领域', cooldown: 14, desc: '在准星处引爆炎魔领域，超大范围灼烧' },
    passive: { name: '烈焰大地', desc: '火箭爆炸在地表留下灼烧带' },
  }),

  // ---- T9 ----
  weapon({
    id: 'po-hong', name: '破鸿', enName: 'Pohong Prime', tier: 9, class: 'ar',
    damage: 560, rpm: 400, mag: 40, reserveMags: 5, reloadTime: 2.4,
    hipSpread: 1.8, adsSpread: 0.3, bloom: 0.1, recoilV: 0.55, recoilH: 0.22,
    falloffStart: 40, falloffEnd: 80, falloffMin: 0.85, headshotMult: 2.2,
    pelletSpread: 0, pellets: 1, projectileSpeed: 0, blastRadius: 0, pierce: 3,
    moveMult: 0.98, adsZoom: 1.6,
    desc: '聚能耦合轨场步枪，一发贯穿一列战列。', accent: '#7df9ff',
    element: 'lightning',
    skill: { type: 'railBeam', name: '破鸿贯空', cooldown: 12, desc: '蓄能发射贯穿全场的轨道光束' },
    passive: { name: '聚能耦合', desc: '连续命中同一敌人时伤害最高 +25%' },
  }),
  weapon({
    id: 'null-singularity', name: '虚数奇点', enName: 'Null Singularity', tier: 9, class: 'energy',
    damage: 345, rpm: 660, mag: 45, reserveMags: 5, reloadTime: 2.6,
    hipSpread: 1.9, adsSpread: 0.35, bloom: 0.11, recoilV: 0.5, recoilH: 0.24,
    falloffStart: 36, falloffEnd: 72, falloffMin: 0.8, headshotMult: 2.0,
    pelletSpread: 0, pellets: 1, projectileSpeed: 220, blastRadius: 1.4, pierce: 2,
    moveMult: 0.99, adsZoom: 1.5,
    desc: '奇点坍缩步枪，击杀牵引周遭一切归于虚无。', accent: '#7df9ff',
    element: 'void',
    skill: { type: 'blackhole', name: '奇点坍缩', cooldown: 16, desc: '在准星处生成奇点，持续牵引并湮灭敌人' },
    passive: { name: '虚数同调', desc: '击杀时牵引 5 米内的敌人并使其易伤' },
  }),
];

export const WEAPON_MAP: Map<string, WeaponDef> = new Map(WEAPONS.map((w) => [w.id, w]));

/** 初始赠送武器 */
export const DEFAULT_OWNED = ['thunder-mk1', 'shadow-smg'];

/** 按品级分组（军械库/商城展示） */
export function weaponsByTier(): WeaponDef[][] {
  const groups: WeaponDef[][] = Array.from({ length: 9 }, () => []);
  for (const w of WEAPONS) groups[w.tier - 1]!.push(w);
  return groups;
}
