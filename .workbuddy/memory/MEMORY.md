# 项目长期记忆 · fps-web-arena（枪战突击 COMBAT STRIKE v6）
> 只留跨会话必需的「架构 / 铁律 / 高频坑」。各系统实现细节按主题查同目录日报。

## 构建与形态
- 纯前端 PVE 单机，单文件 `index.html`（~3.06MB），全内联，`file://` 双击可跑。Three.js v0.152 CDN。存档 `cs_save_v2`。
- **7 个内联 `<script>` 块**：引擎函数全在**块 5 大 IIFE**；首页/dock 监听在**块 2**。
- **跨块铁律**：块 2 调不到块 5 → 引擎内定义后挂 `window._xxx`，外层 `typeof window._xxx === 'function'` 守卫。勿用 try/catch 掩盖作用域错（"弹窗空白"）。
- VISUAL_ENHANCE monkey-patch THREE（`window.__VIS`）；材质特效进此模块。首页 UI 在 `</head>` 前 `<style id="homepage-redesign-2026">`。
- `#esc-menu`：ESC 锁定态仅 `exitPointerLock()`；释放后独立 `mousedown`（`button===2 && !isPointerLocked`）调 `openEscMenu()`。
- **禁止 `git checkout` 回滚**（HEAD 远早于近期）→ 用「精确字符串替换 + assert 计数」脚本。
- **UI 皮肤层（2026-10-01）**：新增收尾 `<style id="ui-v2">`（`</head>` 前最后一个 style 块，同特异度**来源顺序取胜**）。内含统一设计令牌 `:root` + 组件 + 五面板换肤 + 「赛博朋克霓虹层 v3」。**视觉方向最终定为「赛博朋克霓虹」**（最初 A「克制战术」已被用户否掉）：`--accent=电光青 #22e0ff`(身份/主色)、`--tech=品红 #ff3ea5`(交互/工具)、`--violet=#a855f7`、语义色霓虹化；材质=霓虹描边+切角(clip-path)+辉光+网格/扫描线背景；**DOCK 已改为左侧竖排导航轨**（`#start-screen` 是 `position:fixed`，绝对定位安全）。DOCK 图标为 CSS-mask 内联 SVG。**以后改 UI 一律追加到 `#ui-v2`，勿再动旧 style 块。** 参考日报 `2026-10-01`。

## 补丁 / 测试铁律（高频坑）
- **两段式补丁**：先全量 DRY RUN 校验 anchor `count`，**全中才 write**。
- 大块插入用 `find(标记)` + 索引切割；**禁止 `rfind('};')`**；整块替换 anchor 含完整旧块；多 op 不能改同一行（DRY RUN 按原始文本校验）。
- **CSS 块替换坑**：若 anchor 含 `</style>\n</head>`，**替换串必须以 `</style>` 开头**，否则会吞掉上一个 `<style>` 的闭合标签 → 整段 CSS 失效（表现为控件退化成浏览器默认样式，如「白色方块」）。改完必须 `grep -E '<style|</style>'` 数配对。
- **整块 UI 重做要连根拔**：删除某功能块（如模式/工具条）时，除 CSS/HTML/JS 外还要清「调用点 + 注释 + 兜底 UI 引用」，并复查同名易混标识符（例：删「无尽闪避」勿误删 `spawnDodgeEffect`/`diffDodge`/`_dodgeTimer`）。
- **新增状态变量必须显式声明**（漏声明被 try/catch 吞 → 静默失效）。
- **`page.evaluate` 独立作用域**不能直接读写闭包变量 → 改状态经 QA 钩子 setter。
- **QA 钩子**插 `initAll` 内、`animate();` 前；注入前必须 `node --check` 钩子本身（语法错→整块挂死，已踩两次）。**交付前必须剥离 QA 钩子与埋点**。
- **headless 时间拉长**：时钟 ~0.72×；延迟放大 ~5× → 验证延迟类必「等待 ×5」。
- 副本开局玩家 5s 无敌（`isInvincible`）吞伤害 → 量化前先 false。`playerTakeDamage` 单帧伤害上限 → 伤害量化用真实时间等待。
- 语法校验：按 `<script>` 切块逐块 `node --check`。

## ⚠️ 版本状态：已回撤到 2026-09-28 16:12（2026-10-01）
- 用户对 09-29 两轮数值改造（÷1e6 压缩 + 全量重定数值）**均不满意** → **整体回撤**到 09-28 16:12。
- 当前 `index.html` = file-history `cee0b3135230368a@v218`（09-28 16:00:17，3,089,594 B / 45,877 行 / 7 块 0 语法错）。
- v218 **不含** `TIER_BASE_DMG`、**不含** `_CALC_DEFLATE`。下方「统一平衡框架」章节**已废弃**，仅作历史；数值一律以当前源码为准，勿再假设统一框架存在。
- 回撤前的版本已备份：`.workbuddy/backups/index.before-restore-20261001-201457.html`（可反向恢复）。
- 若用户再要改数值：**先问清目标基线**，避免又在旧数值上叠加第二轮改造。
- **回撤后已落地的 2 处改动（2026-10-01）**：① 删除「无尽闪避」模式（CSS/HTML/整段 JS/全部钩子；`无尽闪避` 与 dodge 模式标识符计数均为 0）② 副本三关血量 → `1e13 / 5e13 / 1e14`。

## 版本回滚机制（重要 · 推翻旧「无可回滚点」结论）
- `git checkout` 依旧禁用（HEAD 停在 2026-08-06）；但 **WorkBuddy 文件历史可用**：
- `~/.workbuddy/file-history/<conversationId>/<fileHash>@vN` = **每次编辑的完整文件快照**（全量，非 diff）。`index.html` 的 hash = `cee0b3135230368a`；本会话 convId = `ea4e4b0c-6e58-42d3-afa7-6cacd5cc467b`。
- 配套：`~/.workbuddy/changes-detail/<convId>/cd_*.json`（每次请求变更记录，含 `checkpointId`；大文件 diff 常 `timeout` 省略）、`changes-index/<convId>.json`（请求→文件清单）、`file-tree-manifests/`。
- **回滚做法**：`ls -la file-history/<convId>/<hash>@*` 按 mtime 选版本 → 备份当前 → `cp <version> index.html` → `node --check` 校验。

## 统一平衡框架（2026-09-29 重建 · ❌ 已废弃，见上方版本状态）
（历史记录：S(lv)=1.5^(lv-1) 驱动血量/魂力 + TIER_BASE_DMG 品级表 + 整数规则 —— 该版本已被回撤，当前源码不含）

## 武器体系
- 伤害走 `calcDamage(baseDmg, weaponKey)`；非武器来源 `skipQualityMult`；`quality` 等级=纯标签（`getQualityDamageMult()`恒1）→ 调强度改基础伤害常量。
- 装备：`switchWeapon` 只显隐、`equipFromPanel(slot)` 真赋值、`unequipFromPanel(slot)` 卸下；`createXxxModel` 末尾补 `if(camera.parent!==scene)scene.add(camera)`；商城/图鉴/ownedWeapons 全数据驱动。已下架 deathtower/annihilation/echo/scale。
- **装备槽位键 = `WEAPON_DISPLAY_DATA[key].slot`**（1x 主 / 2x 副 / 3x 近战 / 4x 投掷 / 5x 战术）；装备/卸下是两条并列 if-else 长链，**新增武器必须同时补 `equipFromPanel` 与 `unequipFromPanel` 两处分支**（历史曾漏 3s 血鲨神锯 / 4lw 罗网，2026-10-01 已补）。
- **个人面板装备工具（2026-10-01）**：`#unequip-all-btn`（左栏「已装备武器」标题行、float:right）= 单个「一键卸下全部」，`unequipAllWeapons()` 依次清空主/副/近战/投掷/战术 + 龙骑兵（复用 `unequipFromPanel` + 兜底直清，避免历史遗漏槽位失效）；绑定 `bindLoadoutTools()` 在 `openPanel`/`_openHomepagePanel`（幂等，`_loadoutToolsBound`）。**曾做过 6 分类独立按钮 + 3 槽武器记忆，均按用户要求删除**（用户要的是「一键全卸」且怕占空间）。
- **装备读写档（卸下态持久化）**：存档 `equipped{primary,secondary,melee,grenadeType,tactical}` + `equippedDragoon`。**读档必须尊重 `'none'`**——写成 `(_loadedEquipped && typeof _loadedEquipped.primary === 'string' && _loadedEquipped.primary) ? _loadedEquipped.primary : 'thunder'`（勿用 `!== 'none'` 或直接把 'none' 当空值，否则卸下后刷新会**回落到默认武器**）。仅「完全无存档」时用默认 thunder/shadow/thunderblade。
- **显示武器名统一走 `_weaponName(key)`**（数据驱动 `WEAPON_DISPLAY_DATA[key].name`，无 → '无'）。⚠️ 历史坑：`updatePanelStats`（个人面板「已装备武器」战术栏）与 `updateCurrentWeaponNameDisplay`（右下角手持名）曾用**硬编码 if-else 名单** → 新增武器漏写就显示「无/空手」（例：战术 `chronoterminus`、主武器 `ponghong`）。2026-10-01 已两处全改为 `_weaponName()`。**新增武器后不要再加硬编码名单。**

## 独立模式（与关卡互斥 `if(xxxActive)`）— 无尽闪避已于 2026-10-01 删除
- 现役 2 种：**虚空竞技场** `arenaActive`/L20/`cs_arena_best_v1`（9增益三选一）· **多形态BOSS副本** `raidActive`/L30/`cs_raid_best_v1`（8增益光球）。
- `startLevel(BASE_LEVEL)` 后立刻冻结波次；自建 `updateXxx` 在 animate 驱动；HUD/结算自管。
- RAID：`blueprint:null`→`updateBossAI` legacy；`raidEndRun` 先快照再 `raidResetState()`（后者**不能重置 `raidStageIdx`**）；文案从 `RAID_STAGES[raidStageIdx]` 读。`RAID_STAGES[2]` 两处定义后者生效（**改 hp 需两处同改**）。
- **副本三关血量（2026-10-01）**：`1e13 / 5e13 / 1e14` = 10兆/50兆/100兆。**本作数量级：兆=1e12、京=1e16**（见 L9121 注释）。[1] 万相之主 / [2] 海神斗罗·波塞西 / [3] 死神斗罗·叶夕水(dmg60000)。
- ⚠️ **同名易混（删除闪避模式时）**：`spawnDodgeEffect`（玩家翻滚特效）/`diffDodge`（敌人闪避词缀）/`_dodgeTimer·_dodgeCooldown`（BOSS AI）与闪避模式**无关**，勿误删。

## 高频坑（伙伴 / 副本）
- **伙伴技能解析** `COMPANION_SKILL_BY_ID[id] || COMPANION_SKILL_KINDS[kind]`：按 id 专属优先、按 kind 兜底。**只按 kind 会串味**（叶夕水 7 个 kind 与波塞西重叠）→ 新伙伴专属技能必须注册 `COMPANION_SKILL_BY_ID`。
- 副本伤害用「玩家最大生命占比」`_raidDmg(b,frac)`；单次受伤上限=最大生命×0.4 → 每技占比压在上限下才有递进。
- **副本内玩家状态计时器不递减** → `_raidXxxPlayer` 必须各自挂 `setTimeout` 兜底；减速还要设 `_playerSlowTimer`。
- 红环双魂技：黑环1技/红环2技，字段 `sub:2`，`skillLabel` 为编号唯一来源，击杀播报读技能自身 `tier/sub`（勿用池下标推）。
- 回调内可能 `raidResetState()` 换数组 → 按下标遍历前捕获数组引用，引用变化即中止 + `if(!f)continue`。
- 详见日报：`2026-09-28`(波塞西增强/叶夕水STAGE3/局内HUD) `2026-09-29`(数值重构) `2026-09-18`(50关/地形/击杀归属/伙伴全链路) `2026-09-17`(机制型武器) `2026-09-15`(武器阵容/碰撞/性能)。
