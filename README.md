<div align="center">

# 枪战突击 · COMBAT STRIKE

**商业级 Web FPS 射击游戏 · Three.js + Node.js 全栈**

`工程化架构` · `9 章战役` · `18 款分级武器` · `账号系统 / 商城 / 军械库` · `服务端权威数值`

</div>

---

## 快速开始

```bash
# 安装依赖（npm workspaces：shared / server / client）
npm install

# 开发模式（服务端 :8899 + 客户端 Vite :5173 热更新）
npm run dev

# 生产构建 + 启动（单端口 8899，服务端托管客户端构建产物）
npm run build
npm start
# → 游戏入口 http://localhost:8899
```

打开 **http://localhost:8899**，注册账号即可开始游戏。
服务端未启动时客户端自动进入「离线试玩模式」，进度保存在本机。

## 项目结构

```
combat-strike/
├── shared/               # 前后端共享数据层（数值单一数据源）
│   └── src/
│       ├── types.ts      #   武器/敌人/章节/档案类型定义
│       ├── weapons.ts    #   18 款武器目录（9 品级，含完整射击参数）
│       ├── balance.ts    #   平衡公式：DPS 曲线、经济、成长、波次构成
│       └── index.ts
├── server/               # Node.js 服务端（Hono + 内置 SQLite + JWT）
│   └── src/
│       ├── index.ts      #   入口：API 挂载 + 静态托管 client/dist
│       ├── db.ts         #   SQLite 初始化与迁移
│       ├── auth.ts       #   scrypt 密码哈希 + JWT 签发/校验
│       └── routes.ts     #   认证 / 商城 / 配装 / 战局结算（服务端权威）
└── client/               # Web 客户端（Vite + TypeScript + Three.js）
    └── src/
        ├── main.ts       #   应用流程：登录 → 主菜单 → 对局 → 结算
        ├── api.ts        #   API 客户端（含离线降级）
        ├── ui/           #   登录 / 主菜单(战役·军械库·商城·设置) / 结算
        ├── styles/       #   战术暗色主题
        └── game/
            ├── core/     #   渲染引擎(ACES+Bloom) / 输入 / 程序化音频
            ├── world/    #   程序化地图 / AABB 物理 / 特效池
            ├── player/   #   第一人称控制器（冲刺/蹲伏/后坐/呼吸）
            ├── weapons/  #   武器系统 / 程序化武器模型与换弹动画
            ├── enemies/  #   敌兵 AI / BOSS 阶段 / 弹幕
            ├── hud/      #   战斗 HUD（小地图/伤害数字/击杀播报）
            └── gameloop.ts
```

## 游戏内容

| 系统 | 说明 |
|---|---|
| **战役** | 9 大章节（废弃军械库 → 奇点要塞），3-5 波/章，顺序解锁 |
| **BOSS** | 第 3/6/9 章 BOSS 战（寒霜巨兽 / 熔岩魔像 / 虚数主宰），多阶段攻击模式 |
| **武器** | 18 款 · 9 品级（普通→奇点），9 个枪械类别，商店金币购买 |
| **敌人** | 8 类：突击兵/疾冲者/电浆射手/重装卫兵/自爆蜂群/猎杀浮雷/精英近卫/BOSS |
| **成长** | 账号等级（LV.60 上限）· 金币经济 · 首通/每日首通/重复通关奖励 |
| **手感** | 散布-后坐模型、ADS 开镜、程序化换弹动画、命中反馈（爆头标记/伤害数字） |

## 数值设计（详见 `shared/src/balance.ts`）

- 品级 DPS 曲线：`110 × 1.55^(T-1)`，C 章对应 T 级武器，同级杂兵 TTK ≈ 1 秒
- 敌人生命：`55 × 1.8^(C-1)`；敌人伤害：`基准 × 1.32^(C-1)`
- 经济：首通 `1200 × 2.2^(C-1)` 金币，重复通关 35%，每日首通 +50%
- 结算奖励由**服务端按公式计算**（客户端虚报击杀数会被截断），反作弊冗余系数 1.6

## 工程规范

- **TypeScript 全栈 strict 模式**，共享类型从 `@combat-strike/shared` 单一导入
- **测试**：`npm test` — 28 项（数值平衡不变式 14 项 + 服务端 API/反作弊 14 项）
- **代码质量**：`npm run typecheck` — 三个 workspace 全量类型检查
- **零运行时原生依赖**：服务端使用 Node 内置 `node:sqlite`，密码哈希用 `node:crypto`
- **性能**：合并静态几何、对象池（拖尾/爆炸/投射物/伤害数字）、固定 60fps rAF + 后台降级调度

## 操作

| 按键 | 功能 |
|---|---|
| `WASD` / `Shift` / `Ctrl` / `空格` | 移动 / 冲刺 / 蹲伏 / 跳跃 |
| 鼠标左键 / 右键 | 射击 / 开镜 |
| `R` / `1` `2` `Q` / 滚轮 | 换弹 / 切枪 |
| `ESC` | 战术暂停 |

## 部署

- `npm run build && npm start` — 单端口生产模式（API + 静态资源）
- 推送到 `main` 时 GitHub Actions 自动构建客户端并部署 GitHub Pages 静态预览（离线试玩模式）

## 许可

仅供个人学习与协作开发使用。Three.js 采用 MIT 协议。
