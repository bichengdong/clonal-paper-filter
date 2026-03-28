# ClonalReview 🧬

**克隆植物文献系统综述评审平台 | Systematic Review Platform for Clonal Plant Literature**

🌐 **在线访问 | Live System: [https://bichengdong.github.io/clonal-paper-filter/](https://bichengdong.github.io/clonal-paper-filter/)**

---

## 简介 | Introduction

**中文**

ClonalReview 是一个专为克隆植物生态学系统综述设计的多人协作文献筛选平台。收录文献 **15,173 篇**，团队成员可通过浏览器直接访问，实时共享评审决策，支持 AI 辅助筛选，无需安装任何软件。

**English**

ClonalReview is a collaborative literature screening platform designed for systematic reviews of clonal plant ecology. It covers **15,173 papers** and allows team members to access via browser, share review decisions in real time, and use AI-assisted screening — no installation required.

---

## 功能特性 | Features

| 功能 | Feature |
|------|---------|
| 📄 15,173 篇文献分页浏览 | Browse 15,173 papers with pagination |
| 🔍 全库搜索（跨所有页面） | Full-text search across all 15,173 papers |
| 🏷️ HIGH / MEDIUM / LOW / EXCLUDE 分级显示 | Tiered display: HIGH / MEDIUM / LOW / EXCLUDE |
| ✅ 纳入 / ❌ 排除 / ❓ 待定 决策 | Include / Exclude / Maybe decisions |
| 🤖 AI 辅助筛选（DeepSeek / OpenAI） | AI-assisted screening (DeepSeek / OpenAI) |
| 👥 多评审员实时协作 | Multi-reviewer real-time collaboration |
| ⚡ 冲突检测与解决 | Conflict detection and resolution |
| 📊 评审进度统计 | Review progress statistics |
| 📥 CSV / PRISMA / 全体评审员 数据导出 | CSV / PRISMA / All-reviewer data export |
| 🔄 云端自动同步（每5分钟） | Cloud auto-sync (every 5 minutes) |
| 🔒 密码访问控制 | Password-based access control |

---

## 快速开始 | Quick Start

### 访问系统 | Access

👉 **[https://bichengdong.github.io/clonal-paper-filter/](https://bichengdong.github.io/clonal-paper-filter/)**

### 登录 | Login

| 角色 Role | 密码 Password |
|-----------|--------------|
| 普通成员 Member | 联系项目负责人 Contact PI |
| 管理员 Admin | 联系项目负责人 Contact PI |

> 管理员可配置 AI API Key 并自动同步给所有成员。
>
> Admin can configure the AI API Key in Settings; it syncs automatically to all members.

---

## 文献数据 | Dataset

| 类型 Type | 数量 Count | 说明 Description |
|-----------|-----------|-----------------|
| HIGH | 6,950 | 高置信度克隆植物文献 High-confidence clonal plant papers |
| MEDIUM | 3,595 | 中置信度文献 Medium-confidence papers |
| LOW | 3,142 | 低置信度文献 Low-confidence papers |
| EXCLUDE | 1,486 | 初步排除文献 Preliminarily excluded papers |
| **合计 Total** | **15,173** | |

---

## 系统架构 | Architecture

```
前端 Frontend          后端 Backend           数据库 Database
─────────────         ──────────────         ─────────────────
index.html      ───▶  Node.js + Express  ───▶  MySQL
GitHub Pages           bichengdong.net/api       clonalreview DB
```

- **前端**：纯 HTML + CSS + JS，托管于 GitHub Pages
- **后端**：Node.js + Express，运行于腾讯云服务器
- **数据库**：MySQL，存储评审决策、评审员信息、AI 配置

- **Frontend**: Pure HTML/CSS/JS, hosted on GitHub Pages
- **Backend**: Node.js + Express, running on Tencent Cloud
- **Database**: MySQL storing decisions, reviewers, and AI config

---

## AI 配置 | AI Configuration

支持以下 AI 提供商 | Supported AI providers:

- **DeepSeek**（推荐 Recommended）— `deepseek-chat` / `deepseek-reasoner`
- **OpenAI** — `gpt-3.5-turbo` / `gpt-4o`
- **自定义代理 Custom Proxy**

管理员在「设置」页面配置 API Key 后，会自动同步给所有成员。

Admin configures the API Key in Settings, which is automatically synced to all members.

---

## 文件结构 | File Structure

```
clonal-paper-filter/
├── index.html           # 主页面 Main page
├── data/
│   ├── stats.json       # 文献总体统计 Overall statistics
│   ├── high_*.json      # HIGH置信度文献 (6,950 papers)
│   ├── medium_*.json    # MEDIUM置信度文献 (3,595 papers)
│   ├── low_*.json       # LOW置信度文献 (3,142 papers)
│   ├── exclude_*.json   # 初步排除文献 (1,486 papers)
│   └── all_*.json       # 全部文献 All papers (15,173)
└── .gitignore
```

---

## 本地运行 | Local Development

```bash
# 克隆仓库 Clone repo
git clone https://github.com/bichengdong/clonal-paper-filter.git
cd clonal-paper-filter

# 启动本地服务器 Start local server
python -m http.server 8080

# 访问 Open browser at http://localhost:8080
```

---

## 数据同步说明 | Data Sync

- 每次做出评审决策后**立即**推送至服务器
- 每 **5 分钟**自动从服务器拉取最新数据
- 支持离线模式，网络恢复后自动同步

- Decisions are pushed to server **immediately** after each action
- Auto-pull from server every **5 minutes**
- Offline mode supported; syncs automatically when reconnected

---

## 联系 | Contact

项目负责人 | Principal Investigator: **董必成 Dong Bicheng**

🌐 [bichengdong.net](https://bichengdong.net)

---

*Built with ❤️ for clonal plant ecology research*
