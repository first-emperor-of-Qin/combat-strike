# 更新策略（强制流程）

本项目是**单文件巨型应用**，没有类型系统和单元测试兜底，因此**改代码必须按流程走**。
历史上多次线上事故（界面无反应、模式不可玩、武器打不中）都源于跳过了某一步。

---

## 一、改代码的强制四步

### 步骤 1 — 定位锚点并确认唯一性
用 `grep -n` 找到精确锚点，确认 `count == 1`。**count ≠ 1 一律停止**。

### 步骤 2 — 两段式补丁（Dry Run → Apply）
所有改动都通过一个 Python 补丁脚本完成，**先 dry run 校验所有锚点**，全中才写入：

```python
assert s.count(old) == 1, f"anchor miss: {s.count(old)}"
# 所有断言通过后才写文件
```

禁止直接 `Edit` 大段代码；禁止用 `rfind('};')` 之类猜位置。

### 步骤 3 — 语法与结构校验
```bash
# 按 <script> 切块逐块校验
node /tmp/syntax_check.js index.html
# 结构计数
grep -c '<style' index.html      # 必须 8
grep -c '</style>' index.html    # 必须 8
grep -cE '^<script' index.html   # 必须 8
```

### 步骤 4 — 无头浏览器实机验证
**这是最关键的一步**，能拦截"生成成功但用户看不到"这类问题。

```bash
node /tmp/shot.js       # 逐屏截图 + 捕获 pageerror
node /tmp/shot_td.js    # 进塔防模式跑 20s 采样 HUD
```

判据：
- 截图**亲眼看过**，内容符合预期
- `ERRORS: []`（无 pageerror）
- 关键状态值符合预期（波次、血量、人数等）

**只有四步全过，才允许部署。**

---

## 二、Git 工作流

| 分支 | 用途 |
|---|---|
| `main` | 稳定版 = 生产环境。推送即自动部署 |
| 特性分支 | 日常开发（如 `hardening`） |

```bash
git checkout -b <branch>     # 从最新 main 切特性分支
# ...开发...
git add -A && git commit -m "feat: ..."
git push -u origin <branch>
# 合回 main
git checkout main && git merge <branch> && git push origin main
```

提交信息用 `feat:` / `fix:` / `docs:` / `chore:` 前缀。

---

## 三、部署（以 GitHub 为准）

**GitHub 是唯一事实来源**：先推 GitHub，再由 GitHub 部署。

```bash
# 1. 提交并推送
git push origin main

# 2. GitHub Actions 自动部署到 GitHub Pages
#    workflow: .github/workflows/deploy-pages.yml
#    触发条件: push 到 main 且 index.html 变更

# 3. 需要立即上线（非 Pages 通道）时，从 GitHub 克隆后部署
git clone --depth 1 https://github.com/first-emperor-of-qin/combat-strike.git /tmp/cs-deploy
# 再对该目录执行部署
```

---

## 四、每次更新要同步的内容

| 内容 | 位置 |
|---|---|
| 变更记录 | `docs/CHANGELOG.md` |
| 逐日开发日志 | `.workbuddy/memory/YYYY-MM-DD.md` |
| 架构铁律 / 踩坑 | `.workbuddy/memory/MEMORY.md` |
| README 数字（关卡/武器/模式数） | `README.md` |

---

## 五、禁止事项

| 禁止 | 原因 |
|---|---|
| 直接改 `<style>` 旧层 | 会被后面的层按源码顺序覆盖。新样式一律追加到 `#ui-v2` 末尾 |
| 裸写跨块调用 | 块 2 访问不到块 5 的内部变量 → 幽灵错误 |
| 修改数据绑定字段名 | 大量 JS 按字段名取值（`w.baseDmg` / `enemy.enemyType` 等） |
| 不做步骤 4 就部署 | 线上事故主要来源 |
| 在 `startLevel()` 之前建场景 | 会被 `clearSceneForLevel()` 清空 |
| 每帧写 `camera.position.y` | 与引擎重力/头部摆动打架 → 抖动 |
