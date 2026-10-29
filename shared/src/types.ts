/** 武器类别 */
export type WeaponClass =
  | 'pistol'    // 手枪
  | 'smg'       // 冲锋枪
  | 'ar'        // 突击步枪
  | 'shotgun'   // 霰弹枪
  | 'dmr'       // 射手步枪
  | 'sniper'    // 狙击枪
  | 'lmg'       // 轻机枪
  | 'energy'    // 能量武器
  | 'launcher'; // 榴弹/火箭发射器

/** 品级（1 最基础 ~ 9 最强） */
export type Tier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** 元素属性（决定弹道特效与命中状态效果） */
export type Element = 'none' | 'fire' | 'ice' | 'lightning' | 'void' | 'holy';

/** 主动技能类型（客户端实现对应效果，中键/F 释放） */
export type SkillType =
  | 'powerShot'      // 强化弹：接下来数发伤害倍增+穿透
  | 'shadowstep'     // 影遁：短时加速+减伤
  | 'overdrive'      // 狂暴：短时射速大幅提升
  | 'fireNova'       // 红莲爆裂：以自身为中心的火焰新星
  | 'frostField'     // 冰封领域：持续减速+冰伤区域
  | 'chainLightning' // 雷链：跳跃命中多个敌人
  | 'barrage'        // 弹幕：多枚追踪弹齐射
  | 'blink'          // 相位闪现：向前瞬移
  | 'railBeam'       // 贯空光束：全屏贯穿射线
  | 'blackhole'      // 奇点坍缩：牵引+持续伤害黑洞
  | 'healBurst';     // 圣光解放：治疗+范围圣光伤害

export interface WeaponSkill {
  type: SkillType;
  name: string;
  /** 冷却（秒） */
  cooldown: number;
  desc: string;
}

export interface WeaponPassive {
  name: string;
  desc: string;
}

/** 武器静态数据（服务端权威，客户端只读渲染） */
export interface WeaponDef {
  id: string;
  name: string;
  enName: string;
  tier: Tier;
  class: WeaponClass;
  /** 单发伤害（霰弹为每颗弹丸） */
  damage: number;
  /** 每分钟射速 */
  rpm: number;
  /** 弹匣容量 */
  mag: number;
  /** 备弹倍数（备弹 = mag × reserveMags） */
  reserveMags: number;
  /** 换弹时间（秒） */
  reloadTime: number;
  /** 腰射散布（度） */
  hipSpread: number;
  /** 机瞄散布（度） */
  adsSpread: number;
  /** 散布扩张（连射每发增加，度） */
  bloom: number;
  /** 后坐力垂直分量（度/发） */
  recoilV: number;
  /** 后坐力水平随机分量（度/发） */
  recoilH: number;
  /** 伤害衰减：全程伤害的起始距离（米） */
  falloffStart: number;
  /** 伤害衰减：衰减到 falloffMin 倍的终止距离（米） */
  falloffEnd: number;
  /** 衰减下限倍率 */
  falloffMin: number;
  /** 爆头倍率 */
  headshotMult: number;
  /** 霰弹每发散布（度），非霰弹为 0 */
  pelletSpread: number;
  /** 弹丸数量（霰弹 >1） */
  pellets: number;
  /** 弹速（米/秒），0 = 命中判定（hitscan） */
  projectileSpeed: number;
  /** 爆炸半径（米），0 = 无爆炸 */
  blastRadius: number;
  /** 穿透层数（可穿透的敌人数） */
  pierce: number;
  /** 移动速度倍率 */
  moveMult: number;
  /** 机瞄放大倍率 */
  adsZoom: number;
  /** 商城价格（金币），0 = 初始赠送 */
  price: number;
  /** 需要账号等级 */
  reqLevel: number;
  /** 图鉴描述 */
  desc: string;
  /** 特效主题色（十六进制） */
  accent: string;
  /** 元素属性 */
  element: Element;
  /** 主动技能 */
  skill: WeaponSkill;
  /** 被动特性 */
  passive: WeaponPassive;
}

/** 敌人种类 */
export type EnemyKind = 'grunt' | 'runner' | 'ranged' | 'heavy' | 'bomber' | 'drone' | 'elite' | 'boss';

/** 敌人基础属性（1 章基准值，随章节由公式缩放） */
export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  /** 1 章基准生命 */
  hp: number;
  /** 近战伤害（远程为投射物伤害） */
  damage: number;
  /** 移动速度（米/秒） */
  speed: number;
  /** 攻击间隔（秒） */
  attackInterval: number;
  /** 攻击距离（米） */
  attackRange: number;
  /** 击杀金币基准 */
  gold: number;
  /** 击杀经验基准 */
  xp: number;
  /** 碰撞半径 */
  radius: number;
  /** 身高 */
  height: number;
}

/** 章节定义 */
export interface ChapterDef {
  id: number;
  name: string;
  enName: string;
  subtitle: string;
  /** 场景主题（决定地图生成器配色/材质） */
  theme:
    | 'bunker' | 'neon' | 'polar' | 'desert' | 'mine'
    | 'furnace' | 'orbital' | 'void' | 'citadel';
  /** 波次数 */
  waves: number;
  /** 建议账号等级 */
  suggestedLevel: number;
  /** 天空/雾基色 */
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  /** 主光照颜色与强度 */
  sunColor: string;
  sunIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  /** 地面与墙体材质色 */
  groundColor: string;
  wallColor: string;
  accentColor: string;
}

/** 单波敌人构成（数量按章节与波次公式生成） */
export interface WavePlan {
  index: number;
  enemies: Partial<Record<EnemyKind, number>>;
  /** 本波是否包含 BOSS */
  boss: boolean;
}

/** 玩家档案（服务端返回） */
export interface Profile {
  id: number;
  username: string;
  level: number;
  xp: number;
  gold: number;
  createdAt: number;
  ownedWeapons: string[];
  /** 武器强化等级（weaponId → 0~10） */
  upgrades: Record<string, number>;
  loadout: { primary: string | null; secondary: string | null };
  chapterUnlocked: number;
  chapterCleared: number[];
  stats: { kills: number; deaths: number; runs: number; bestWave: number; playtimeSec: number };
}

/** 结算回报（服务端计算后发放） */
export interface RunReward {
  gold: number;
  xp: number;
  levelUp: boolean;
  newLevel: number;
  firstClear: boolean;
  dailyFirst: boolean;
  unlockedChapter: number | null;
}

/** 登录/注册响应 */
export interface AuthResponse {
  token: string;
  profile: Profile;
}

// ---- 品级视觉表 ----
export const TIER_LABELS: Record<Tier, string> = {
  1: '普通', 2: '优良', 3: '稀有', 4: '史诗', 5: '传说',
  6: '神话', 7: '禁忌', 8: '超限', 9: '奇点',
};

export const TIER_COLORS: Record<Tier, string> = {
  1: '#9aa3ad', 2: '#4caf50', 3: '#2f81f7', 4: '#9b59f6', 5: '#ffb020',
  6: '#ff6a00', 7: '#ff3860', 8: '#ff4fd8', 9: '#7df9ff',
};

export const WEAPON_CLASS_LABELS: Record<WeaponClass, string> = {
  pistol: '手枪', smg: '冲锋枪', ar: '突击步枪', shotgun: '霰弹枪',
  dmr: '射手步枪', sniper: '狙击枪', lmg: '轻机枪', energy: '能量武器',
  launcher: '发射器',
};
