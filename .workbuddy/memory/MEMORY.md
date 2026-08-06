# 项目长期记忆 · fps-web-arena（枪战突击 COMBAT STRIKE v6）

## 形态与构建
- 纯前端 **PVE 单机**游戏，无后端运行时（server/ 于 2026-08-03 删除；联机/王者乱斗/背包/后台全移除）。
- **单文件形态（无构建工具）**：唯一交付物是单个 `index.html`（~36.4k 行 / 2.44MB），CSS/HTML/JS 全内联；双击 `file://` 即可运行，或静态托管（GitHub Pages/Vercel/Netlify/CloudStudio/`python3 -m http.server`）。2026-08-04 **撤销**了 Vite 模块化实验（曾短暂抽离 `src/visual`、`src/characters` 两模块并用 Vite 打包 `dist/index.html`），现已恢复为纯单文件；`package.json`/`vite.config.js`/`src/`/`dist/`/`node_modules` 均已删除。
- 存档 `localStorage`(`cs_save_v2`)；Three.js v0.152 + Google Fonts 走 CDN（fonts 离线降级系统字体，Three.js 必需）。

## 架构要点
- 内联 JS 顺序：移动端警告 / 启动引导占位 / 图鉴系统(纯数据+DOM，`buildShop`/`fmtHP`/`formatCN` 被引擎外调用) / Three.js CDN / Three.js 初始化 / 主引擎(大 IIFE ~3.2 万行) / 启动引导(存档接线)。多层 `!important` 覆盖层，改 UI 须找最后获胜规则。
- **VISUAL_ENHANCE 模块**（内联于 index.html，叠加式低风险）：monkey-patch `THREE` 构造函数注入程序化贴图+金属感、指数雾、`WebGLRenderer` ACES/sRGB 兜底、`setInterval(60ms)` 阴影刷新节流；含 GLTF 管线 `window.__VIS`（`MODEL_ASSETS` drop-in 映射、`enhanceBoss` 描边+发光核心）。材质/贴图/特效/GLTF 改动进此模块，勿散改 3 万行 IIFE。
- 个人面板滚动修复：flex 链缺 `min-height:0` → 加 `min-height:0 !important`；`#panel-right` 改 `overflow-y:auto`；`#panel-inner` 改 `max-height:calc(100vh - 48px)`；openPanel() 已 `exitPointerLock()`。

## 关卡系统（数据驱动 · 30 关）
- 6 章：余烬荒原(1-5)/深渊裂谷(6-10)/霜寂冰原(11-15,ice)/虚空核心(16-20,void)/曦金古城(21-25,radiant)/苍穹圣域(26-30,celestial)。章 BOSS 关 15/20/25/30 纯 BOSS 战。
- **增删改关卡须同步（否则崩溃/读不到数据）**：①`window.__BOSS_HP_TABLE__`；②`MAX_LEVEL`；③`LEVEL_WAVE_COUNTS`；④`enemyBaseHP` 循环上界+`ENEMY_SHAPES`；⑤`LEVELS.push`（精英 skill 须来自 10 键）；⑥`BOSS_BLUEPRINTS[lv]`（bodyGeo 限7种、skills 须已注册30个、passive 须10个）；⑦`BOSS_CREATORS[lv]`；⑧`_buildBossBody` switch；⑨`buildMonsterCodex`/`renderLevelSelectPage` 循环 `<= MAX_LEVEL`；⑩选关文案「共 X 关」。BOSS 由 `createBossFromBlueprint(currentLevel)` 生成。

## 武器/技能高频坑
- **装备入口**：`switchWeapon(slot)` 只做显隐/UI；真正赋值在 `equipFromPanel(slot)`（`equippedPrimary=`+`createXxxModel()`），卸下 `unequipFromPanel`。新增武器须在两者各加 `else if` 分支，不只加 `switchWeapon`。
- **武器模型场景图**：`createXxxModel` 末尾加 `if (camera.parent !== scene) scene.add(camera)`，否则非 startLevel 态装备不显示。
- **tempEffects**：推送 `{group}` 或 `{obj}` 二选一，且 `updateTempEffects` 与 `clearSceneForLevel` 两处清理都须兼容二者，否则每帧抛错+特效残留（落雷/湮雷类用 group 包裹）。
- **统一伤害入口**：武器伤害走 `calcDamage(baseDmg, weaponKey)`（含品质+强化倍率）；敌人/observer 非武器来源传 `skipQualityMult=true`。基础伤害文本走 `getWeaponBaseDmg(key)` 而非静态字段。
- **技能栏高度**：`#weapon-skills-panel` 两处 `max-height`，须同时改 L677 与 L2063 为 `calc(100vh - 120px)`。

## 性能优化（2026-08-02）
- 卡顿主因=方向光阴影每帧重渲染。优化：shadow.mapSize 2048→1024；VISUAL_ENHANCE `setInterval(60ms)` 关 `autoUpdate` 周期置 `needsUpdate`；动态画质 FPS<40 连续2s 降级（黏性防抖）。

## 测试方法论（puppeteer 可复用）
- headless 需 `--enable-unsafe-swiftshader --use-angle=swiftshader --use-gl=angle` 软渲染。
- 闭包作用域：游戏状态/函数在 IIFE 内，须临时 `window.__xxxQA` 钩子驱动战斗（测后删除）。
- ⚠️ headless 空闲期 rAF 节流→状态"卡住"；验证冷却用确定性 `tick(dt)` 或保持页面活跃。
- `initAll` 直接启动无登录门控，`file://` 加载即 init。puppeteer-core + 系统 Chrome；managed node 22.22.2。
- 语法校验：`/tmp/check_syntax.py`（inline script `node --check`）。
