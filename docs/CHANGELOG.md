# 变更记录

## 2026-10-04

### 新增
- **塔防模式「最后的庇护所」**：守安全屋 + 保护 NPC，20 波僵尸，每 5 波递增 BOSS（第 20 波为最终 BOSS，40× 血量 / 3.2× 体型），玩家 5 次复活。安全屋或 NPC 血量归零即失败
- 模式入口「最后的庇护所」替换此前的荒岛行动（BR）实验版本

### 修复
- **射击链路**：`shoot()` 内多处历史遗留的悬空调用（`triggerMuzzleFlash` 无定义、`spawnImpactDust` / `destroyEnvProp` 无定义、`trackEnemyDamage` / `spawnGenesisField` 跨块不可见）导致每次开枪在扣弹后抛异常中断——弹道、伤害数字、击杀判定、准星反馈全部失效
- **武器仓库布局**：`getWeaponBaseDmg()` 对高阶武器返回长描述，在紧凑行卡中撑爆 `auto` 列，把武器名挤成 0 宽显示为乱码 → 列表改用短字段 `WEAPON_DISPLAY_DATA[key].baseDmg`
- **详情浮窗不可见**：动态创建 overlay 时只设 `id` 未设 `className`，导致 CSS 完全不生效
- **武器卡「已拥有」标签**：移除冗余标签

### 变更
- 商业级 UI 重构（TACTICAL VIVID）：材质分层、克制的霓虹、三级高度阴影、精密排版、全套动效
- 武器仓库：悬停展开 → 高密度行卡 + 点击「详情」浮窗
- 局内 HUD 重排：弹药移至准心右下（36px 数值）、血条加粗、武器名置于准心下方、击杀播报右缘
- 修复龙骑兵：初始不再默认装备；冰雀射速 1 秒 3 次 → 1 次
- 修复相位行者：补齐 `WEAPON_FULL_DESC` 条目（商城无法购买、价格异常、图鉴描述不全）
- 下架实验模式：猎杀令 BOUNTY、撤离行动 EXTRACTION、荒岛行动 BR

## 2026-10-04（云服务）

### 新增
- **WorkBuddy 云服务接入**（applicationId `wbapp_U2gGZ6X3byvTxWfJZuuqbz`）
  - CDN 引入 `@tencent-ai/workbuddy-cloud-sdk@dev`，用平台下发的 `publicConfig`（endpoint / publishableKey / oauthRelayBaseUrl）初始化
  - **登录**：手机号验证码登录注册 + 邮箱密码登录 + 邮箱验证码注册（`cloud.auth`，无匿名登录）
  - **云存档**：`game_saves` 表按 `(owner_id, save_key)` upsert；登录后自动拉取，与本地 `cs_save_v2` 比较 `ts` 后决定恢复或回传；进度变更节流上传
  - **云端排行榜**：`leaderboard` 表，竞技场 / 副本 / 塔防三榜，公开读、本人写
  - 首页 dock 新增「☁️ 云端账号」「🏆 排行榜」入口
- 数据表（RLS 已开启，策略见 `docs/ARCHITECTURE.md`）：
  - `game_saves` — `owner_id TEXT DEFAULT auth.uid()`，仅本人读写
  - `leaderboard` — 公开读，`owner_id` 写保护

### 验证
- 线上 `GET /.cloud/database/rest/leaderboard` 返回 200，排行榜正常渲染空态
- 未登录时不产生任何写请求（鉴权门控生效）
- 8 个 script 块 0 语法错；页面 0 运行时错误
