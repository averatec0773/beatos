<div align="center">

<img src="apps/desktop/resources/icon.png" width="96" alt="BeatOS" />

# BeatOS

### 为 beatmaker 的真实工作方式打造的 beat 库。

不是表格，不是 DAW，也不是交易市场。**BeatOS** 是一个 local-first 的家，收纳你硬盘里的每一条 beat——用真正能*卖出* beat 的元数据整理一次，把打标签的苦活交给 AI，然后**导出或一键发布到你真正在卖货的平台**。可作为原生**桌面应用（macOS · Windows）**运行，也可直接在**浏览器**里跑。单用户、离线、无账号、无遥测。

[![version](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/averatec0773/beatos/main/apps/desktop/package.json&query=$.version&label=version&prefix=v&color=7c5cff&style=flat-square)](CHANGELOG.md)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Web-1f1f1f?style=flat-square)](#安装与运行)
[![license](https://img.shields.io/badge/license-Apache--2.0-1f1f1f?style=flat-square)](LICENSE)
[![status](https://img.shields.io/badge/status-pre--release-orange?style=flat-square)](ROADMAP.md)
[![MCP](https://img.shields.io/badge/MCP-Claude%20%E2%80%A2%20Codex%20%E2%80%A2%20any%20client-7c5cff?style=flat-square)](#ai-副驾驶mcp)

<br/>

[English](README.md) · **简体中文**

</div>

---

<div align="center">
  <br/>
  <img src="screenshots/beatos-core-product-demo.gif" alt="BeatOS 演示：库内搜索、播放、loopkit 导出、Publish Center 与 AI Agent Actions" width="1100" />
  <br/><br/>
</div>

## 为什么是 BeatOS

大多数 beatmaker 用表格记录自己的库，再把同样的元数据一条条手动敲进每个平台。BeatOS 用**一份规范的总目录**取代它，并把别处不会同时具备的三件事合在一起：

- 🎯 **为卖 beat 而生**——带多币种定价的 license tier、producer 署名、tagged/untagged/loop/stems、BPM 与 Key。不是把一个通用媒体管理器硬掰成这个样子。
- 🤖 **AI 原生**——为 AI agent 时代而建。在编辑器里用 **AI 标签建议**直接起草 genre、mood 和 tag（自带 key），或接入一流的 **MCP 服务器**，让 Claude 或 Codex 帮你整理目录、打标签、准备每个平台的元数据。每一次写入都等你批准。
- 🚀 **为出货而造，不只是收纳**——免费导出干净的、每个平台专属的元数据以及打包好的 loopkit / beat pack；**Pro 增加辅助发布**，驱动真实浏览器，在平台的人机验证环节交还给你。

## 它能做什么

<table>
<tr>
<td width="33%" valign="top">

### 🗂️ 为卖货而生的目录

每条 beat 都存进真正的 SQLite 数据库：标题、**BPM、Key、genre + mood**（多值）、**producer 署名**、tag、**带多币种定价的 license tier**、描述，以及每个角色的音频——tagged/untagged、**loop、stems**（WAV/MP3/FLAC）——外加封面。软删除回收站可恢复。在整个目录里一键重命名或合并某个 producer。成交时可从任一 tier 生成**逐买家的 license PDF**（英文或中文），并**导出 tagged MP3**，把标题、producer、BPM、Key 和封面都烤进文件的 ID3 标签里。

</td>
<td width="33%" valign="top">

### 🔎 瞬间找到任何一条 beat

在整个目录里搜索并叠加筛选——**BPM 区间、Key、genre、mood、producer、有无音频**——最近搜索一键可达。库表格实时排序与筛选；播放队列跟随你正在看的内容。

</td>
<td width="33%" valign="top">

### 📦 Loopkit、beattape 与 beat pack

把若干 beat 整理成一个列表，然后**打包寄出**——一份 loopkit、一份 beattape、一份给歌手的 beat pack。逐条、逐文件挑选要放进去的内容（批量勾选所有 WAV / 所有 MP3），再导出为 **ZIP** 或普通文件夹，每条 beat 一个子文件夹。

</td>
</tr>
<tr>
<td width="33%" valign="top">

### 🎚️ 分析与 AI 打标签

按需进行**BPM + Key 检测**，带逐字段置信度评分（Essentia 引擎，或宽松许可的 librosa 后备）——分析单条，或**批量处理整个库**，自动补全空字段。可选的 **AI 标签建议**（自带 key）从封面 + 标题起草 genre/mood/tag 供你审阅；默认关闭，仅桌面端。

</td>
<td width="33%" valign="top">

### 🤖 AI 副驾驶（MCP）

一个 MCP 服务器把你的库暴露给 Claude Code、Claude Desktop、Codex 以及任何 MCP 客户端——免费 **23 个工具**（Pro 共 **28 个**）。写入在你的 MCP 客户端自身批准下生效，并记录到 **Agent Actions** 看板；切到只读即可彻底禁止写入。

</td>
<td width="33%" valign="top">

### 🚀 辅助发布（Pro）

无需离开 BeatOS 即可发布一条 beat：引擎驱动真实浏览器，并在平台的验证环节暂停。**Publish Center** 实时显示每个平台的会话健康度。当前可用目标：**抖音（Douyin）宣传视频与网易 激灵（BeatSoul）**，**BeatStars** 在[路线图](ROADMAP.md)上。仅 Pro 构建——免费构建会将其置灰。

</td>
</tr>
</table>

**而且它用起来像一款产品，不像一个数据库。** Spotify 风格的卡片与 Coverflow、悬浮播放器、动态 WebGL 背景（**Aurora** 极光或 **ASCII** 字符雨）、一颗发光的搜索 orb，以及可调的玻璃面板透明度层——全部打包好，可完全离线运行。完整**双语（English / 中文）**，并独立控制 genre/mood 标签的显示方式。

## 桌面或浏览器——一套代码，两个前端

BeatOS 同时以**原生桌面应用**（Electron）和**浏览器应用**（由同一个 Python sidecar 提供的本地 web SPA）发布。一套 React 代码同时构建两者，因此它们始终保持同步——仅 Electron 才有的能力（原生文件对话框、在 Finder 中显示、拖出）通过一层薄薄的 `platform` 接缝路由，背后有一个 same-origin 的 web 实现。

| | |
|---|---|
| **桌面** | 完整的原生体验。今天从源码 `make dev`；打包安装器将在 `v0.1.0` 落地。 |
| **浏览器** | `make web` 构建 SPA 并在 `http://127.0.0.1:8765` 提供服务——**同一后端、同一个库、几乎一致的 UI**，无需 Electron 构建。今天在 Windows 或任何地方运行的最简单方式。 |

两者都是 **local-first 且离线**——浏览器应用只与 `127.0.0.1` 通信。（远程/局域网访问与移动端布局在[路线图](ROADMAP.md)上。）

## AI 副驾驶（MCP）

> **BeatOS 为 AI agent 时代而建。** MCP 接口不是附属功能——它是让整理目录、打标签以及（即将到来的）发布无需手工劳动即可规模化的方式。

**已验证客户端：** Claude Code · Claude Desktop · Codex CLI/App · 任何讲 stdio JSON-RPC 的 MCP 客户端。

**为什么主动权在你手里：** 你的 MCP 客户端为每一次工具调用把关（逐次允许 / 拒绝），且 BeatOS 应用的每一次写入都记录在 **Agent Actions** 看板里——改了什么、何时、结果如何。想要硬性停止？把 agent 切到**只读**，写入会被直接拒绝。批量工具（`create_tracks` ≤100、`attach_assets` ≤500）把一次 50 条的导入变成一个动作，而不是一百个。

```text
你：     "把所有 140 BPM 以上、没有 genre 的 beat，
          根据封面和标题标成 'Trap' 或 'Drill'。"

Claude： list_tracks(bpm_min=140) → 12 条 → 起草一个 patch
         update_tracks(items=[...])    ← 你的客户端请你允许这次调用

你：     允许

Claude： 已应用——这 12 处编辑落地并出现在 Agent Actions 中
```

<details>
<summary><b>全部 MCP 工具（23 个免费 · +5 个 Pro）</b></summary>

| 类别 | 工具 |
|---|---|
| **读取** | `list_tracks`、`get_track`、`search_tracks`、`list_lists`、`list_distinct_values`、`export_metadata`、`list_export_platforms`、`ping` |
| **生命周期** | `create_tracks`、`trash_tracks`、`restore_tracks`、`purge_tracks` |
| **列表** | `create_list`、`update_list`、`delete_list`、`add_tracks_to_list`、`remove_tracks_from_list`、`reorder_list` |
| **元数据** | `update_tracks`、`merge_metadata`、`set_license_tiers` |
| **资产** | `attach_assets`、`detach_assets` |
| **发布（Pro）** | `publish_track`、`publish_status`、`list_publish_platforms`、`publish_session_status`、`list_publish_jobs` |

</details>

## Local-first，从设计之初

| | |
|---|---|
| **无服务器** | sidecar 绑定 `127.0.0.1` 并 same-origin 提供浏览器前端。没有东西离开本机——包括你与 MCP agent 的对话。 |
| **无账号** | 单用户。无登录、无同步、无云。 |
| **无遥测** | 应用自身零外发请求。 |
| **你的文件原地不动** | BeatOS 引用路径；除非你要求，否则不移动、不重命名任何文件。 |
| **数据归你所有** | 一个 SQLite 文件，放在你的每用户应用数据目录里，避开会让 SQLite 损坏的云同步目录（可在设置中配置）。用任何工具都能打开它。 |

## 安装与运行

> 打包好的桌面安装器将在 `v0.1.0` 到来。在那之前，从源码运行。浏览器前端无需打包。
> **目标平台：** macOS 12+ · Windows 10+ · 任何现代浏览器。（Linux：仅 dev + web。）

**前置条件：** Node ≥22 LTS · Python 3.11.x · [`uv`](https://github.com/astral-sh/uv)

```bash
make sync && (cd apps/desktop && npm install)   # 一次性设置

make dev    # 桌面：Electron + sidecar
make web    # 浏览器：构建 SPA + 提供服务，打开一个标签页
```

> **没有终端？** 双击仓库根目录下的 **`start-beatos.command`**（macOS）或 **`start-beatos.bat`**（Windows）——它会检查/安装前置条件，然后启动浏览器或桌面应用。

<details>
<summary><b>接好 MCP 服务器（Claude Desktop / Claude Code / Codex）</b></summary>

MCP 服务器位于 `packages/beatos-mcp`。它把你的 MCP 客户端（stdio）桥接到应用的 sidecar（本地 HTTP）。即便 BeatOS 关闭它也会附着（展示一个 `beatos_status` 工具），打开应用后完整的库工具会自动出现——无需重启客户端。

1. **安装依赖：** 在仓库根目录运行 `uv sync`（创建 `.venv`）。拉取后重新运行。
2. **启动 BeatOS** 并保持打开。
3. **一键设置（推荐）：** **Settings → AI Integration** → 点击你的客户端。BeatOS 会合并配置（带一个 `.beatos.bak` 备份）或替你运行 `claude mcp add`。
4. **手动后备**——自行注册（`--directory` 必须是仓库的绝对路径）：

   ```json
   { "mcpServers": { "beatos": {
       "command": "uv",
       "args": ["run", "--directory", "/absolute/path/to/beatos", "beatos-mcp"]
   } } }
   ```

   Codex `config.toml`：
   ```toml
   [mcp_servers.beatos]
   command = "uv"
   args = ["run", "--directory", "/absolute/path/to/beatos", "beatos-mcp"]
   startup_timeout_sec = 20
   tool_timeout_sec = 120
   ```
5. **验证：** 重启客户端，调用 `ping`。写入是被提议而非直接应用的——在 **Agent Actions** 中批准它们。

**排错：** `sidecar not running` → 应用未打开（第 2 步）· `command not found` → 运行 `uv sync`（第 1 步）· 工具列表为空 → 重启客户端。

</details>

<details>
<summary><b>Pro 构建（发布）与测试</b></summary>

**Pro 构建。** 发布位于私有的 `packages/pro/` 子模块。在有访问权限时：
```bash
git submodule update --init packages/pro
uv pip install -e packages/pro/beatos-publish --no-deps && uv pip install "patchright>=1.40"
make dev-pro    # 或：make web-pro
```
没有它时，免费构建正常运行并将发布置灰。完整步骤：[`packages/pro-mount-notes.md`](packages/pro-mount-notes.md)。

**测试。**
```bash
cd apps/desktop
npx vitest run                          # renderer + main
npm run build && npm run smoke          # 桌面 e2e（Playwright _electron）
npm run build:web && npm run smoke:web  # 浏览器 e2e（Playwright chromium）
uv run pytest packages/                 # Python sidecar（core + http + mcp）
```

</details>

## 技术栈

`Electron 39` · `React 19` · `Vite` · `Tailwind` · `Radix UI` · `Zustand` · `TanStack Virtual` · `dnd-kit` · `Tone.js`
`Python 3.11` · `FastAPI` · `aiosqlite` · `structlog` · `mcp`（FastMCP）· `librosa` / `essentia`（可选）· `Playwright`
`SQLite` · `Pydantic v2`

单一 React renderer 构建两个目标——Electron（`electron-vite`）和一个由 FastAPI sidecar 在 `/` 提供的浏览器 SPA（`vite.config.web.ts`）。

## 仓库结构

```
apps/desktop/              Electron 外壳 + React renderer（同时构建浏览器 SPA）
packages/
  beatos-core/             纯 Python 业务逻辑（无 web/RPC 依赖）
  beatos-http/             FastAPI 门面——renderer API、/api/fs，以及 web SPA
  beatos-mcp/              面向 AI agent 的 stdio MCP 服务器
  beatos-platforms/        每个平台的 vocab 映射
  pro/                     私有子模块——发布；免费构建中缺席
screenshots/               README 资源
```

## 路线图

当前处于 **dogfood 阶段**——UI/UX 补丁以 `0.0.X.Y` 版本落地。已交付：目录、搜索、AI/MCP 接口、应用内 AI 打标签、按需元数据导出、播放列表 + 导出、**桌面 + 浏览器**前端，以及首批 Pro 发布适配器（抖音宣传视频 + 网易 激灵）。下一步：首个打包安装器（`v0.1.0`）、一个 **BeatStars** 适配器（中期），以及面向 web 应用的远程/局域网访问与移动端布局。

完整计划：[`ROADMAP.md`](ROADMAP.md) · 已交付历史：[`CHANGELOG.md`](CHANGELOG.md)。

## 许可证

Apache License 2.0——见 [`LICENSE`](LICENSE) 与 [`NOTICE`](NOTICE)。
Copyright 2026 Scott Huang（[averatec0773](https://github.com/averatec0773)）。

---

<div align="center">

由 [averatec0773](https://github.com/averatec0773) 制作 · [averatec.studio](https://averatec.studio)

</div>
