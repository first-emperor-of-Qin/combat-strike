# 架构说明

## 1. 交付形态

**整个游戏 = 一个 `index.html`（约 3.1 MB / 4.7 万行）**，内部全内联，无构建步骤。
改任何东西都只改这一个文件；部署即部署这一个文件。

### 内联结构

```
<style> × 5   ① 基础 ② 主角实时UI ③ Vanguard ④ 赛博朋克霓虹层 ⑤ #ui-v2（追加层）
<script> × 7  ① 移动端拦截 ② 首页/面板 ③ …  ④ …  ⑤ 引擎主块（大 IIFE）⑥ … ⑦ …
```

| 块 | 职责 |
|---|---|
| **块 5** | 引擎主体（一个大 IIFE）：场景、关卡、武器、敌人、UI 数据、结算 |
| **块 2** | 首页、dock 导航、面板开关 |
| **#ui-v2** | 追加样式层（永远追加，不改旧层 —— 旧层被其他 style 块按源码顺序覆盖） |

## 2. 铁律：跨块作用域

块 2 **无法**访问块 5 内部变量。跨块调用必须：

```js
// 块 5 内定义后显式挂到 window
window.someFn = someFn;
// 块 2 内调用前守卫
if (typeof window.someFn === 'function') window.someFn();
```

> 用 `try/catch` 掩盖作用域错误会产生"弹窗空白"这类幽灵问题，禁止。

## 3. 数据表（全部集中在块 5 前部）

| 表 | 用途 |
|---|---|
| `LEVELS` | 每关敌人配置（`melee` / `ranged` / `elite` / `boss`） |
| `WEAPON_DISPLAY_DATA` | 武器展示数据：名称/图标/品质/类别/伤害/射速/弹匣/主动/被动 |
| `WEAPON_FULL_DESC` | 武器完整描述（typeLabel / 加成 / 被动数组 / 主动数组 / 价格） |
| `DRAGOONS` | 龙骑兵（当前：冰雀） |
| `COMPANION_*` | 伙伴与魂技 |
| `RAID_STAGES` | BOSS 副本关卡（注意：**同键多处定义，后者生效**） |
| `QUALITY_DAMAGE_MULT` | 品质伤害倍率（1 级 ×4 … 9 级 ×10） |

### 伤害结算链

```
calcDamage(baseDmg, weaponKey, skipQualityMult)
  → 场内攻击增益 → 模式乘区(竞技场/副本)
  → 魂力系数 → 武器养成加成 → 品质倍率
```

武器 UI 上的「伤害」若需要**短文案**，用 `WEAPON_DISPLAY_DATA[key].baseDmg`；
`getWeaponBaseDmg(key)` 返回的是**长描述**（含技能说明），只适合详情面板。

## 4. 坐标系与单位

- Three.js 右手系，**Y 轴向上**，地面 y = 0
- 角色移动速度约 **3.3 单位/秒**（世界尺度很大，`移速` 面板显示的是含加成后的派生值）
- 敌人数组 `enemies` 权威；BOSS 在 `boss` 变量
- 关卡边界 `BOUNDS = { minX, maxX, minZ, maxZ }`
- 相机即玩家位置（第一人称）：`camera.position`

> **世界尺度是最大的坑**：`soulPower` 基础值 1000、伤害基础 9、移速可达数百。
> 任何"距离 / 射程 / 范围"常量都必须按实际世界尺度校核，不能凭直觉写。
> 射线检测的 `far` 若小于目标实际距离，会**打不中且不产生任何反馈**（历史上出现过多次）。

## 5. 四种模式的接入范式

新模式一律**与关卡系统完全解耦**，只以 `if (xxxActive)` 短路接入：

```js
// 1) 冻结关卡波次系统
stopSpawning = true; waveSpawnActive = false; currentWave = 0;
waveEnemyTotal = waveEnemiesSpawned = waveEnemiesKilled = 0;
bossSpawned = waveBossSpawned = allWavesCleared = false;

// 2) 复用 startLevel(底座关卡) 拿到地形
startLevel(20);   // 20 = 虚空核心（单一大场景，无分区大门）

// 3) 死亡结算钩子（玩家死亡处）
if (arenaActive) arenaEndRun();
if (tdActive)    tdOnDeath();

// 4) 主循环钩子（animate 内，独立 try/catch 隔离）
if (arenaActive) { try { updateArena(delta); } catch (e) { /* 只报一次 */ } }
if (tdActive)    { try { updateTD(delta); } catch (e) {} }

// 5) 击杀计数钩子（killEnemy 内）
if (arenaActive) { arenaKills++; }
```

**模式异常绝不能带崩本体** —— 主循环钩子必须各自独立 `try/catch`。

## 6. 已知引擎限制（设计新玩法前必读）

| 限制 | 影响 | 应对 |
|---|---|---|
| **玩家无障碍物碰撞** | 墙/箱子挡不住玩家 | 自己做 AABB 推出；**注意用局部空间**，世界 AABB 会因建筑旋转而变大 → 空气墙 |
| **玩家单层地面** | 无法上楼、多层建筑 | 自己做可行走面（floor）列表 + 高度贴合 |
| **每帧写 camera.position.y 会抖动** | 与引擎头部摆动/重力打架 → 上下抽动 | 除非实现多层地面，否则**不要写 y** |
| **僵尸/敌人只追玩家** | 无法攻击建筑 | 用距离判定代替"攻击建筑"行为 |
| **startLevel 会 clearSceneForLevel** | 之前建好的场景被清空 | 世界生成必须在 `startLevel()` **之后**；容器被移出场景需 `scene.add()` 重新挂回 |
