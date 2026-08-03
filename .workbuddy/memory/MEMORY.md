# 项目长期记忆 · fps-web-arena（枪战突击 COMBAT STRIKE v6 静态单体版）

## 当前定位（2026-08-03 重大重构：彻底纯前端化）
- 2026-08-03 用户要求：移除所有后端代码，只保留前端的 .html 单体文件。
- 已删除：`server/`（auth.js/db.js/index.js/realtime.js/social.js/data/）、`node_modules/`、`package.json`、`package-lock.json`、以及全部后端部署基建（`Dockerfile`、`docker-compose.yml`、`fly.toml`、`deploy.sh`、`deploy-native.sh`、`fps-arena.service`、`ecosystem.config.js`、`wrangler.jsonc`、`nginx/`、`.github/workflows/`）和文档（README/DEPLOY/HANDOFF/overview/AUDIO_CHANGES/CONVERSATION_LOG）——`.git`（历史）与 `.workbuddy`（项目记忆）保留。
- 项目现在是**纯静态单体 HTML**：单文件 `index.html`（约 2.4MB / 3.8 万行）即可运行，**无需 Node 后端、无需构建**。
- 保留：联机 stub（`Net.connect=noop`、`__fpsGate` 直接放行、tdm/pve 占位），PVE 内容（30 关 / 33+ 武器 / Boss 系统 / 角色 / 商城 / 强化 / 图鉴）。
- 当前分支仍是 `zcode`。

## 关键架构事实（避免重复踩坑）
- 单体前端 index.html（~38k 行/2.4MB），CSS/HTML/JS 全内联。存在多层带 !important 的覆盖层（联机样式 ~3000行、NEXUS REDESIGN、premium、responsive）。改 UI 必须 grep 全文件找最后一条获胜的 !important 规则并在那里改。
- **6 个内联 `<script>` 块**（顺序）：
  1. L3649–3692 移动端警告
  2. L4495–4501 联机桩（`window.MP/__netHooks/__fpsGate`，直接解锁）
  3. L4503–5392 图鉴系统（纯数据+DOM，前置加载）
  4. L5394 外部 Three.js v0.152（CDN）
  5. L5397–5437 Three.js 加载后初始化
  6. L5439–37619 **游戏主引擎**（大 IIFE，约 3.2 万行：武器/敌人/Boss/UI/商城/技能 等）
  7. L37643–38072 启动引导（存档/事件接线）
  注：4 是外部 CDN（cdn.jsdelivr.net）；其它 6 块为 inline（与 `/tmp/check_syntax.py` "6 inline script blocks" 对应）。
- **零后端运行时依赖**：`index.html` 没有 `fetch(/api`、没有 `WebSocket`、没有 `XMLHttpRequest`——联机层已全部桩化。存档走 `localStorage`（`cs_save_v2`）。Three.js 和 Google Fonts 仍走 CDN（保留即可；fonts 离线降级系统字体，Three.js 必需）。
- **运行方式**：双击打开（file://）即可在浏览器跑通完整 PVE；或托管为静态站（GitHub Pages / Vercel / Netlify / 任意静态 http 服务）。
- 之前的后端要点（realtime.js 鉴权/auth.js verifySessionToken/`match_result_ack` 等）**已失效**，不要再参考。`window.__netHooks / window.MP` 仍在 index.html 4496–4500 作为扩展点保留，但当前无实际联机逻辑接入。
- 之前的部署指引（GitHub Pages 仅作静态镜像 / Render/Railway/VPS 跑 Node / `pm2 restart fps-arena` / `npm start`→:3000 / `DEPLOY.md`）**已全部作废**。

## 个人面板（#player-panel）滚动修复要点
- 根因：flex 链缺 `min-height:0`，`#panel-body`/`#panel-right` 被内容撑开并被 `#panel-inner{overflow:hidden}` 裁切，内部 `#tab-warehouse` 的 `overflow:auto` 永不触发 → 滚轮看不到完整内容。
- 修复：给 `#panel-body`/`#panel-left`/`#panel-right` 加 `min-height:0 !important`；`#panel-right` 改为 `overflow-y:auto`（整右栏滚动）；`#tab-weapon-content` 设 `display:flex;flex-direction:column`；`#panel-inner` 由固定 `height:min(720px,90vh)` 改为 `max-height:calc(100vh - 48px);height:auto`。openPanel() 已 `document.exitPointerLock()` 释放指针锁，滚轮事件可达面板。
- 样式集中在 index.html 的「个人面板 · 简洁大气重构」注释块（原 v2 块，已重做），编辑须在最后获胜的 !important 层。

## 验证手段（已验证可用）
- 后端 5 文件 + 前端 5 个内联 `<script>` 均用 `node --check` 校验（managed node 22.22.2）。
- 联机冒烟：两 ws 客户端 register→queue(tdm,teamSize:1)→收到 match_found→发 match_result→收 match_result_ack。脚本可参考 /tmp/ws-smoke.js。

## 关卡系统（数据驱动 · 30 关，2026-07-28 扩至 21-30）
- 6 章节：余烬荒原(1-5) / 深渊裂谷(6-10) / 霜寂冰原(11-15, ice) / 虚空核心(16-20, void) / 曦金古城(21-25, radiant 暖金明亮) / 苍穹圣域(26-30, celestial 冷白天空城)。章节 BOSS 关 15/20/25/30 为纯 BOSS 战（`LEVEL_WAVE_COUNTS=[0,0,0]`，无小怪波，BOSS 在第三波触发）。
- 21-30 新增：BOSS_SKILLS +12、BOSS_PASSIVES +2（solar_crown/celestial_ward）、精英技 +8、bodyGeo +torusknot/tetra、掩体模式 +5（alley/cross/bazaar/spiral/sanctum，均 keepClear 出生点(0,20)r9+中心r6）、装饰器 _decorateRadiant/_decorateCelestial。HP 链至 30 关 12,783,403,951,529。
- ⚠️ 校验脚本坑：正则 `const BOSS_SKILLS = \{(.*?)\};` 会被嵌套 `};` 截断产生"技能未注册"误报；应校验 `key: { id: 'key'` 配对存在性。
- **增删/改关卡必须同步以下结构**（否则运行时崩溃或读不到数据）：
  1. `window.__BOSS_HP_TABLE__`（文件顶部，索引 0-20，×1.5 链，首关 1 亿）—— 被 `BOSS_HP_TABLE = window.__BOSS_HP_TABLE__` 引用；
  2. `MAX_LEVEL`（=20，关卡选择/下一关/胜利结算进度闸门，多处引用）；
  3. `LEVEL_WAVE_COUNTS`（每关 3 波 `[小怪,精英,0]`，章 boss=`[0,0,0]`）；
  4. `enemyBaseHP` 循环上界（`i<=20`）；`ENEMY_SHAPES`（仅 10 种形状名，extend 时复制即可，逻辑不消费它）；
  5. `LEVELS.push({ melee/ranged/elite + boss })`：精英 `skill` 必须来自已实现 10 键（lunge/whirlpool_pull/blink_strike/charge_shield/curse_cloud/ice_dash/thunder_leap/death_charge/transmute/void_blast）；
  6. `BOSS_BLUEPRINTS[lv]`：`bodyGeo` 限 7 种（cylinder/sphere/octahedron/cone/box/icosahedron/dodecahedron）+ `skills[3]` + `passive`；**skills 必须来自已注册 30 个 `BOSS_SKILLS`、passive 必须来自 10 个 `BOSS_PASSIVES`，否则建 BOSS 必崩**；
  7. `BOSS_CREATORS[lv]` 派发表（`createBossFromBlueprint(lv)`）；
  8. `_buildBossBody(level)` 的 switch 装饰（不加只少装饰，不崩）；
  9. `buildMonsterCodex` 与 `renderLevelSelectPage` 循环改 `lvl <= MAX_LEVEL`；
  10. 选关 UI 文案「共 X 关」。
- BOSS 实际由 `createBossFromBlueprint(currentLevel)` 用 `BOSS_BLUEPRINTS[currentLevel]` 生成；`LEVELS[lv].boss.skills` 仅供图鉴展示，与蓝图一致即可。
- 校验：5 段 inline script `node --check`；数据交叉校验脚本提取 `BOSS_SKILLS`/`BOSS_PASSIVES` 的 `id` 键比对蓝图/精英键（思路见对话 `/tmp/validate_levels.js`）。
- 部署（2026-08-03 改）：改为**纯静态托管**——`scp index.html` 到任意静态服务器（nginx/Apache/Caddy），或拖入 GitHub Pages / Vercel / Netlify / CloudStudio 沙盒；旧 VPS Node 部署（`/opt/fps-arena/` + `pm2 restart fps-arena` + `http://182.92.179.201:3000/`）已作废，线上地址已断链。

## 测试方法论（puppeteer 线上验证 · 可复用）
- **initAll 登录门控**：游戏把 initAll/registerStartScreenButtons/character-init 经 `window.__fpsGate` 推迟到 `unlockBoot()`（登录后）才执行。puppeteer 直接加载时 init 不跑，`window.WEAPON_DISPLAY_DATA` 等不会暴露。测试时手动解锁：`window.__fpsBootState='unlocked'; const q=window.__pendingBoots||[]; window.__pendingBoots=[]; q.forEach(fn=>{try{fn()}catch(e){}});`。
- **闭包作用域**：几乎所有游戏函数/状态（startLevel/tianfaShoot/enemies/ownedWeapons/equippedPrimary/scene/renderer 等）都在大 IIFE 内，既非 window 属性、bare 也访问不到。要驱动战斗只能：临时加 `window.__xxxQA={...}` 钩子暴露闭包函数（测后务必删除并重新部署），或走真实 UI 登录流程。
- **headless WebGL**：默认无 GPU，THREE.WebGLRenderer 创建失败 → initScene/initInputHandlers 抛错。启动 puppeteer 加 `--enable-unsafe-swiftshader --use-angle=swiftshader --use-gl=angle` 即可软渲染通过。
- **⚠️ rAF 节流误判坑（武器冷却验证必读）**：headless 在 `await sleep()` 纯空闲期会**节流 requestAnimationFrame**，使游戏主循环暂停 → 冷却/状态看似"卡住不动"。验证武器冷却**不要**靠空闲 sleep 后读值，而要用**确定性 `tick(dt)`**（临时钩子里直接 `cd=Math.max(0,cd-dt); updateX(dt);`）或让页面保持活跃（频繁 evaluate）。天罚(tianfa) 首版就因漏接主循环冷却递减 + 此坑导致误判，最终在 QA 钩子里加 `tick(dt)` 才确证修复。
- **预存 bug**：`bindPCGuard()` 在 L34432 被调用但从未定义，boot 期被 try/catch 吞掉，不影响 initAll，非武器改动引入（可择机清理）。
- puppeteer 环境：puppeteer-core + 系统 Chrome `/Applications/Google Chrome.app`；NODE_PATH 指向 `/Users/qian/.workbuddy/binaries/node/workspace/node_modules`；managed node 22.22.2。

## ⚠️ 新增特效/武器必读（防回归·高频坑）
- **tempEffects 推入规范**：所有特效必须推 `{ group: <THREE.Group> }` 或 `{ obj: <Object3D> }` 二选一。但 `updateTempEffects` 与 `clearSceneForLevel` 的清理逻辑**两处都必须同时兼容 `fx.group` 和 `fx.obj`**——否则对缺失的那一类会每帧 `fx.xxx.traverse` 抛错（卡顿）+ `scene.remove(undefined)` 后对象永不移除（特效残留）。落雷/射线类（tianfaBolt/thunderexBolt）就因用 `{obj}` 而两处清理只认 `group` 导致：落雷线残留在屏幕 + 每帧抛错卡顿。**新增任何 Line/独立 mesh 特效务必用 group 包裹，或在两处清理都加 obj 分支。**
- **武器技能/落雷 AOE 伤害**：若不走 `calcDamage()` 缩放，会随灵魂力提升显得异常偏低（与主射击不一致）。统一在结算入口 `calcDamage(base)`。
- **品质基础伤害倍率（全局 rebalance 钩子）**：`calcDamage(baseDmg, weaponKey, skipQualityMult)` 内按 `WEAPON_DISPLAY_DATA[wId].quality` 取倍率，由 `getQualityDamageMult(wId)` 提供（divine=10 / legendary=7 / heroic=5 / 其他=1）。这是所有武器伤害的**唯一统一入口**——任何"全武器加伤/降伤"类需求都应改这里，不要再逐武器改常量。注意：敌人伤害与 observer 吸收回血属非武器来源，调用时传 `skipQualityMult=true`（Z型敌死炸弹 `calcDamage(750)` 与 4 处 observer 吸收 `calcDamage(BASE_DMG)` 已处理）。
- **武器强化系统**：所有武器最高1000级，每级+1%基础伤害，由 `getEnhMult(wId)=1+enhLevel/100` 提供，在 `calcDamage` 品质倍率之后乘（wzlb 同层）。`weaponEnhLevel` 字典 + `weaponEnhanceStones` 总数，存档 `cs_save_v2` 已双向接入。文本与实弹一致靠 `_adjBase(wId,raw)=round(raw×品质×强化)` 与 `getWeaponBaseDmg`/`getWeaponTrueBaseDmg` 全部复用——任何"基础伤害数值"展示都必须走 `getWeaponBaseDmg(key)`，不要再用 `WEAPON_DISPLAY_DATA[key].baseDmg` 静态字段（仓库已改为动态）。强化石商城10金/个，升N级累计耗 1+2+…+N 石（`getEnhStonesToTarget`）。
- **技能栏高度**：`#weapon-skills-panel` 有两处 `max-height` 且 L2063 是全局 `!important`（220px），5 张技能卡≈244px 会溢出遮挡底部。改高度务必**同时改 L677 与 L2063** 为 `calc(100vh - 120px)`。
- **返回主页健壮性**：`goToHomeScreen` 内 `clearSceneForLevel/_bpExitSwitchMode/clearAllTimers/restartGameState` 任一抛错都会中断函数、主页不显示。清理调用务必各自 try/catch。
- **新增主武器必须接入的装备/卸下入口（高频坑）**：`switchWeapon(slot)`（L26941-27026）只做通用显隐/UI/冷却，**真正的装备赋值在 `equipFromPanel(slot)`（L31823 起）**——`equippedPrimary='xxx'` 与 `createXxxModel()` 都在此；卸下在 `unequipFromPanel(slot)`。新增武器务必在 `equipFromPanel`/`unequipFromPanel` 各加 `else if (slot === '<slot>')` 分支。**不要只加进 switchWeapon**（否则装备不生效）。QA 驱动装备应调 `equipFromPanel(slot)`；`switchWeapon` 在菜单态会因 `levelComplete`/`weaponSwitchCooldown` 守卫提前 return，且它的 `slot === currentWeaponSlot` 守卫用字符串 slot 比对数字，须 `prepEquip` 把 `levelComplete=false;weaponSwitchCooldown=0;currentWeaponSlot=0` 才能通过。
- **武器挂在相机下的场景图坑（2026-08-03 弧电离子不显示修复）**：所有主武器 `createXxxModel` 都把武器组 `camera.add(weaponGroup)`。Three.js 的 `renderer.render(scene, camera)` 只遍历 `scene` 子树——**相机本身必须在 scene 子树里**，否则挂在它下面的武器不会被绘制。`startLevel(L12000)` 负责 `scene.add(camera)`；但 home/菜单态不调用 `startLevel`，若在那时装备武器就会"模型不显示"。所有 `createXxxModel` 末尾加防御守卫 `if (camera.parent !== scene) { try { scene.add(camera); } catch(e) {} }`，确保不论何时装备武器都生效。复现用 puppeteer 时注意：home 屏渲染器本就停摆，不是相机问题——必须先 `startLevel(1)` 再装备、且像素分析才能确认模型可见。
