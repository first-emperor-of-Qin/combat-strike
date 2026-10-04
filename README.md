# 枪战突击 · COMBAT STRIKE

**单文件 Three.js 第一人称射击游戏** — `index.html` 即完整项目，浏览器直接打开即可运行（无需构建、无需服务器）。

[![Weapons](https://img.shields.io/badge/weapons-43-orange)]()
[![Modes](https://img.shields.io/badge/modes-4-purple)]()
[![File](https://img.shields.io/badge/single--file-3.1MB-blue)]()
[![Pages](https://img.shields.io/badge/deploy-github%20pages-success)]()](https://first-emperor-of-qin.github.io/combat-strike/)

---

## 快速开始

```bash
# 本地运行：直接用浏览器打开
open index.html

# 或起个静态服务
python3 -m http.server 8000    # → http://localhost:8000
```

## 游戏模式

| 模式 | 说明 |
|---|---|
| **关卡战役** | 4 大章节 · 50 关 · 10 档难度，敌人数与血量逐关翻倍 |
| **虚空竞技场** | 无尽生存 · 每 5 波 BOSS · 三选一增益构筑 · 记录最高波次 |
| **BOSS 副本** | 多形态 BOSS 挑战 · 限时增益 · 高难度专属武器 |
| **最后的庇护所**（塔防） | 守安全屋 + 保护 NPC · 20 波僵尸 · 每 5 波递增 BOSS · 5 次复活 |

## 技术栈

- **Three.js**（CDN，`r150+`）+ 原生 JS（无框架、无打包器）
- 7 个内联 `<script>` 块 + 5 个 `<style>` 块，全部内联在 `index.html`
- 存档：`localStorage`（`cs_save_v2`）

## 文档

| 文档 | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 代码结构、数据表、坐标系与单位约定、扩展方式 |
| [docs/PLAYBOOK.md](docs/PLAYBOOK.md) | **更新策略** — 改代码的强制流程、验证方法、部署流程 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 变更记录 |
| `.workbuddy/memory/` | 逐日开发日志与长期记忆（架构铁律 / 踩坑记录） |

## 贡献与部署

- `main` = 稳定版（生产环境由此分支自动部署）
- 特性开发走独立分支 → PR 合并
- 推送到 `main` 且 `index.html` 变更时，GitHub Actions 自动部署到 GitHub Pages

## 许可

仅供个人学习与协作开发使用。Three.js 采用 MIT 协议。
