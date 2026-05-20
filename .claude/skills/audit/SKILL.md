---
name: audit
description: 检修。运行时探索 + 代码深审 + 漂移扫描，用户说"审查/检修/audit/review/扫描"时调用。
---

# BeatOS 检修

三段式只读审查。用户可指定子阶段（`runtime` / `code` / `drift` / `all`）；
未指定时先问，或按 `drift → code → runtime` 顺序执行（最便宜的先）。

## 通用原则

- **只读**。任何阶段都不修改源码、不动 git。
- **现场推断目录结构**，不要假设具体路径。每次开始前：
  1. `git log --oneline -10` 了解近况
  2. `ls` 仓库根，识别顶层结构
  3. Read `CLAUDE.md` 头部 + 任何顶层 `conventions/` 或 `docs/` 索引
  4. 用 Glob/Grep 现场列出要审查的模块/包，不要硬编码包名
- **引用项目自有规范，不复述**。`CLAUDE.md` 已在上下文里；critical rules、架构红线、命名约定全部以它和 `conventions/` 为准。本 skill 永远不复制粘贴那些条目。
- **区分有意未完成 vs 漂移**。任何看似"未完成"的代码先 grep `ROADMAP.md` 和 `CHANGELOG.md`，如已追踪则标 *tracked* 跳过。
- **每条结论必须含 `file:line`**，方便点开。
- **报告写到 `reports/audits/<phase>/<timestamp>/report.md`**（目录不存在则创建；建议把 `reports/` 加入 `.gitignore`）。报告末尾必须有"建议下一步"清单：立即修 / 转 issue / 接受/搁置。
- **跑前清理**：进入任何阶段前，列出对应 `reports/audits/<phase>/` 下条目数，超过 5 个则保留最近 5 个、提示用户删除更旧的。
- **token 自控**：单次会话使用过半时收尾写报告，不要硬撑到中断。

## 截图与日志策略

- 默认**不截图**。运行时探索首选 accessibility snapshot（结构化文本，便宜）。
- 截图仅用于：视觉布局/层叠/溢出疑似异常、需要附证据到报告。单次审查 ≤3 张。
- 截图存到 `reports/audits/runtime/<timestamp>/shot-N.png`，或 base64 inline 嵌入报告（你选低成本的一种）。
- 日志：跑完运行时操作后 tail 项目日志目录最近 N 行（先 `ls` 找日志目录，不假设位置）。标记任何 `ERROR` / unhandled rejection / stack trace / 未预期 warning。

---

## Phase A — Runtime（运行时探索）

> 目的：以"真实用户"视角运行当前构建，发现 dogfood 没走到的反常路径与未捕获错误。

### A.0 准备
1. 在项目内找冒烟脚本：先看顶层 `package.json` 的 `scripts.smoke`，或 `scripts/`、`apps/*/scripts/` 下 `smoke.*`。若找不到则跳到 A.1。
2. 跑冒烟脚本（在它所属的工作目录）。失败则停下，把失败粘出来，**不要进入 A.1**——baseline 都炸了，探索是浪费。

### A.1 自主探索（核心，3 轮）
- 检查 `.claude/settings*.json` 是否启用了 Playwright/MCP 浏览器/Electron 控制工具。
  - **可用**：通过 MCP 启动应用并交互。
  - **不可用**：降级——只跑冒烟 + 读日志 + 静态推断"高风险路径"列在报告里。
- 每轮选一个场景。优先级：
  1. 最近 commit 改过的功能区域（`git diff HEAD~5..HEAD --name-only` 看哪些文件变了）
  2. `CLAUDE.md` Critical rules 涉及的反模式现场可达路径（如 selector 反模式涉及的列表页、auto-save 涉及的编辑页等）
  3. 自主提出 `CLAUDE.md` 未覆盖的边界情况

每轮记录：假设 → 执行 → 日志异常 → 结论（PASS / SUSPICIOUS / FAIL）→ 证据。

### A.2 报告
写到 `reports/audits/runtime/<YYYY-MM-DD-HHMM>/report.md`：

```
# Runtime Audit — <date>
## Baseline (smoke): PASS|FAIL|N/A
## Scenarios
### S1 <name>
- 假设 / 执行 / 日志异常 / 结论 / 证据
## 发现总结
- HIGH / MEDIUM / LOW
## 建议下一步
- 立即修 / 转 issue / 接受
```

---

## Phase B — Code（代码深审，按模块轮转全量扫）

> 目的：完整读一个模块每一行，找潜在风险与 session 漂移残渣。

### B.0 选模块
- 用户指定优先。
- 未指定时：
  1. `ls reports/audits/code/` 看最近扫过谁
  2. 现场列出仓库下所有 "模块" 候选——任何包含独立 `package.json` / `pyproject.toml` / 明显独立责任的目录都算
  3. 挑最久没扫过的；若是首次跑，从最 critical 的（核心数据/业务逻辑层）开始

### B.1 完整读
- 列出该模块所有源文件（排除 tests、自动生成、`.d.ts`、第三方 vendored、`__pycache__` 等）。
- **完整 Read 每一个**。不要 grep 抽样，不要只读头部。
- 模块大到读不完：停下，告诉用户"建议拆 X 和 Y 分两次"，本次不出报告。

### B.2 三层分析

**Layer A — Critical rules 命中**
逐条对照 `CLAUDE.md` 头部的 Critical agent rules + `conventions/architecture.md` 中的 "What NOT to change" 节（如存在）。每条违反给：file:line、引文、违反的规则编号或条款、修复建议。

**Layer B — 场景化潜在风险（最重要）**
对每个公开函数 / handler / 组件 / 路由 / 工具入口，构造 2-3 个**具体**场景：
- 输入边界：null / undefined / 空 / 极大 / 错类型
- 异步与竞态：连点、网络慢、进程半途被 kill、并发写
- 资源：文件缺失、权限拒绝、磁盘满、DB lock、句柄泄露
- 生命周期：组件 unmount 时未取消的 promise、订阅未解绑、副作用泄漏
- 跨层错误传播：底层抛错时上层是否能正确回滚 / 提示

不要写"建议加 validation"这种空话。每条必须给"复现路径 + 当前后果 + 建议"。

**Layer C — Session 漂移残渣（在本模块范围内）**
- `TODO` / `FIXME` / `XXX` / `HACK` / `@deprecated`：区分 tracked / untracked
- 半成品：空函数体、纯 `return`、被注释掉的 ≥3 行 block、`NotImplementedError`、`throw new Error("not implemented")`
- 死代码：未被任何文件 import 的 export、未在路由/注册表中引用的 handler/组件
- 文档失同步：本模块在 `conventions/` 是否有对应章节，章节里提到的符号是否还存在

### B.3 报告
写到 `reports/audits/code/<YYYY-MM-DD>-<module-slug>/report.md`：

```
# Code Audit — <module> — <date>
## 范围: N 个文件，X 行
## Layer A: Critical rule 命中
## Layer B: 潜在风险 (HIGH / MEDIUM / LOW)
## Layer C: 漂移残渣
## 建议下一步
```

---

## Phase C — Drift（全仓漂移扫描）

> 目的：找跨 session 留下的"被遗弃 / 半成品 / 文档代码失同步 / 命名失同步"痕迹。
> 不审查代码质量，专审"是否漂移"。

### C.1 扫描清单

1. **注释残渣**：全仓 grep `TODO|FIXME|XXX|HACK|@deprecated`，排除测试 / 第三方 / 自动生成。每条标 tracked / untracked（依 ROADMAP/CHANGELOG）。
2. **半成品代码**：空函数体、纯 `return`/`pass`、≥3 行被注释 block、生产代码里的 `console.log` / `print` / `println`（排除已知的日志入口和调试脚本，先 `ls scripts/` 和 `tests/` 把它们筛掉）。
3. **死代码**：
   - 每个源文件的 export 名 → 全仓 grep 其引用，零引用列出
   - 未在任何路由表 / 注册点 / 配置中引用的 handler / 组件 / tool
   - **迁移文件被改写**（如项目有 `migrations/` 目录）：`git log --follow --oneline -- <migration-file>` 看历史超过 1 次 commit 的（违反"迁移仅追加"规则的强信号）
4. **文档/代码失同步**：
   - `conventions/` 与 `CLAUDE.md` 中提到的目录 / 文件 / 函数现是否存在
   - `CLAUDE.md` 的 Critical rules / 反模式 → 现场 grep 是否仍有命中（应为零）
   - `CHANGELOG.md` 最近 3 个版本提到的新能力，`conventions/` 是否已覆盖
5. **命名/概念失同步**：用 git log 找最近 5-10 个版本里"删除/重命名"过的概念，全仓 grep 是否仍有残余引用
6. **依赖漂移**：
   - `package.json` / `pyproject.toml` 声明但代码零引用的依赖
   - 反向：代码 import 但 lock 文件查不到的（罕见但 catch）

### C.2 报告
写到 `reports/audits/drift/<YYYY-MM-DD>/report.md`：

```
# Drift Audit — <date>
## 1. 注释残渣 — Untracked: N / Tracked: M
## 2. 半成品代码
## 3. 死代码（含 migration 改写警报）
## 4. 文档失同步
## 5. 命名失同步
## 6. 依赖漂移
## 建议下一步
- 立即清: ...
- 转 issue: ...
- 文档补丁: ...
- 接受/搁置: ...
```

---

## 跑完之后

每个阶段结束都向用户报告：报告路径、HIGH 计数、最关键的 1-3 条发现。**不要自动 fix、不要自动开 issue、不要 commit。** 用户审阅后决定下一步。
