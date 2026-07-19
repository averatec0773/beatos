# 文件管理模型重构 + 文件夹导入管线（设计稿）

> 状态：设计稿（含 3 个待决策项）。事实依据：SOLUTION-DESIGN-REVIEW-2026-07.md
> 审计 + 本次对 `assets/service.py`、`hashing.py` 的逐行确认。
> 拆分建议见文末——单个 spec 不超过 10 个工作日。

## 0. User Journey（目标态）

用户把整个 beats 文件夹（或其中一个子文件夹）拖进 BeatOS，或点
"导入文件夹"选中它。几秒内出现一张**预览表**：每行是一个识别出的 beat，
展开可见它的文件（tagged MP3、untagged WAV、stems.zip、封面）各自落在
哪个槽位，BPM/key 已从文件名预填，已在库中的文件标灰为"重复，跳过"。
用户扫一眼，把两个聚错的文件拖到正确的行，点一次"导入 87 个 beat"。
完成后可选一键"对新导入做批量分析"。此后就算他把整个文件夹改名或
搬去新硬盘，在设置里重新指一次目录，整库自动恢复，零手动操作。

## 1. 现状事实（为什么现在做不到）

| 事实 | 位置 | 后果 |
|---|---|---|
| 附件只存绝对路径，永远 `linked`，`managed`/`rel_path` 是从未写入的死字段 | `assets/service.py:113-116`、`models/asset.py:22` | 文件夹改名/换机器 = 整库失联；目录库绑死单机 |
| 每次 attach 同步算全文件 sha256 | `service.py:90`、`hashing.py` | 多 GB stems 单次请求卡数十秒；批量导入 = 小时级哈希墙 |
| sha256 只用于 relocate 校验和分析缓存键，无去重、无查找索引 | `service.py:192-196`；无 sha 索引 | 算了最贵的指纹，却没享受任何收益 |
| `missing_sweep` 只翻 `missing` 标志；恢复靠逐文件手动 relocate 且要求 sha 完全一致 | `service.py:208-244`、`:178-205` | 移动一个文件夹 = 几百次手动"Find file" |
| 每个 attach 独立开连接、独立 commit | `service.py:96-119` | N 文件导入 = N 连接 N 事务，无原子性 |
| 后端不存在任何文件夹扫描端点；前端拖 N 个文件建 N 个单资产轨道 | 审计确认；`create-track-from-file.ts:60-101` | 30–50 次交互/beat 的根源 |
| attach 已会用 mutagen 预填 BPM | `service.py:121-142` | "从文件推元数据"有先例，导入管线可扩展它 |

## 2. 设计总览

三个新概念，一条新管线：

```
library_root (库根)          file_index (文件索引)         ImportPlan (导入计划)
"我的 beats 都在这几个目录"   "扫描器的增量缓存+指纹库"       "预览表的数据结构"

  选/拖文件夹
      │
  [scan job]  walk → stat 增量比对 file_index → 只对新/变文件算 quick_hash
      │
  [聚簇+解析]  文件名归一化 → 变体聚簇 → 槽位分配 → BPM/key/制作人解析 → 查重
      │
  ImportPlan  ──前端可编辑预览表──►  用户确认（可拖行、改槽位、改标题）
      │
  [apply]     一个事务批量建轨+挂资产（复用 MCP 批量 handler 的 defaults 逻辑）
      │
  [后台队列]   补全 sha256（低优先级）→ 可选批量分析
```

### 2.1 库根（library_root）——路径的下半场

```sql
CREATE TABLE library_root (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,      -- 绝对路径，用户注册
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
-- asset 表新增（表重建迁移，沿用 021 的模式）：
--   root_id INTEGER NULL REFERENCES library_root(id),
--   rel_path TEXT NULL,          -- root 内相对路径
--   quick_hash TEXT NULL
-- 语义：root_id 非空 → 有效路径 = root.path / rel_path（abs_path 变为缓存，
-- root 重指向时批量重算）；root_id 空 → 沿用 abs_path（库外文件/legacy）。
```

- 导入文件夹时自动把它（或其祖先）注册为 root。
- **整库搬迁 = 设置里给 root 换个路径**，rel_path 不动，零逐文件操作。
- 换机器：DB 拷过去 + 重指 root，目录库首次真正可移植。
- 旧数据迁移：注册 root 时扫一遍现有 asset,`abs_path` 落在 root 内的
  自动回填 `root_id + rel_path`，一次性。

### 2.2 两级指纹——解决"sha256 又贵又没用上"

全文件 sha256 对多 GB stems 是扫描期不可承受的成本，但去重和自动重链
又需要内容身份。拆成两级：

- **quick_hash（扫描期，毫秒级）**：`blake2b(首 64KB ‖ 尾 64KB ‖ size)`
  （stdlib，无新依赖；首尾块避开同模板文件头的碰撞）。用于：聚簇期查重、
  重链候选、增量扫描。
- **sha256（导入后，后台补全）**：现有算法不变（兼容既有行），改为
  低优先级后台队列逐个补，attach 不再同步等它。用于：重链最终确认、
  分析缓存键（顺手修审计发现的空串键碰撞：sha 未知时用 asset_id 兜底）。

```sql
CREATE TABLE file_index (         -- 扫描器的增量缓存 + 指纹库
  id INTEGER PRIMARY KEY,
  root_id INTEGER NOT NULL REFERENCES library_root(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mtime_ns INTEGER NOT NULL,
  quick_hash TEXT NOT NULL,
  sha256 TEXT NULL,               -- 后台补全
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  UNIQUE(root_id, rel_path)
);
CREATE INDEX idx_file_index_quick ON file_index(quick_hash);
CREATE INDEX idx_file_index_sha ON file_index(sha256);
```

**增量规则（rsync/restic 模式）**：重扫时先 stat；`(size, mtime)` 未变
→ 直接复用行，不碰文件内容。二次扫描一个千文件库应当是秒级。

### 2.3 扫描 + 聚簇 + 解析（管线核心）

后台 job（复用 batch_analysis 的 job/poll 模式），walk 与哈希在线程池，
进度可查。产出 `ImportPlan`：

**聚簇**——回答"哪些文件是同一个 beat"：
1. 归一化文件名：去扩展名 → 剥离**变体词**（tagged/untag/clean/wet/dry/
   loop/stems/master/final/mix/v2 等词表，可配置）→ 折叠分隔符 → casefold。
2. 聚簇键 = 归一化名；**跨兄弟目录聚簇**：当父目录名本身是角色词
   （`Tagged/`、`WAV/`、`Stems/`——制作人按角色分文件夹是常见布局），
   该目录名消费为角色提示，聚簇只看文件名。
3. 单文件成簇是合法结果（一个孤儿 MP3 = 一个待补全的 beat）。

**槽位分配**——role×format 模型不变，规则填充：
扩展名→format（复用 `EXT_TO_FORMAT`）；变体词→role（tagged→audio_tagged、
loop→loop…）；zip→stems；图片→cover；**无变体词的单音频默认
audio_untagged**（与 MCP 侧 `_resolve_attach_role` 的既有约定一致）；
同簇同槽冲突或无法判定 → 该文件进"待定"列，由用户在预览表拖放决定。

**文件名解析**——预填而非覆盖，全部带置信度、低于阈值只提示不填
（沿用批量分析 0.7/0.6 的阈值哲学）：
BPM（`\b\d{2,3}\s*bpm\b`，裸数字 60–200 降置信度）、key（`[A-G][#b]?m?`、
`Amin`、`F# minor` 等模式）、制作人（`@`、`prod.` 记号）。mutagen 标签
预填保留（先例已在 `service.py:131`）。

**查重**——quick_hash 对 file_index 与既有 asset 双向查：
同 hash 已在库 → 标"已存在，跳过"（默认勾选跳过，可改为"作为新轨道
再导"）；计划内互重 → 合并为一条。

### 2.4 Apply——一次事务，复用既有逻辑

`POST /api/import/apply` 接收（用户可能已编辑的）ImportPlan：
- **单连接单事务**批量执行（修掉 N 连接 N commit 的现状）；
- 建轨走 MCP 批量 handler 的路径（`handlers/ingest.py:88`）——它已经
  应用 `default_license_tiers`/`default_is_free`，顺手消灭"人类建轨
  不吃默认值、agent 建轨吃"的不一致；
- 挂资产写入 `root_id + rel_path + quick_hash`，sha256 留空进后台队列；
- 返回 per-cluster 结果（成功/失败/跳过），失败不中断批次（沿用
  loopkit 导出的哲学）。

### 2.5 自动重链——missing_sweep 的升级

现 sweep 只翻标志。升级为三段：
1. 标 missing（现状逻辑不变，含批量 stat 的线程化）；
2. **对 missing 资产查 file_index**：sha256 已知 → 按 sha 精确匹配自动
   重链；只有 quick_hash → 匹配候选 + 后台全哈希确认后重链；
3. 只有两级都找不到的才留给人工"Find file"。
配合库根，"整个文件夹改名"从几百次手动操作变成：重指 root（秒级）或
重扫后自动重链（分钟级，零交互）。

### 2.6 顺手解锁的能力

- **Watch folder（roadmap v0.5 提前）**：= 定时对 root 重扫 + 对新簇
  发通知。file_index 让重扫是秒级，这个功能变成一个 cron + 一个 toast。
- **Web 端导入**：扫描在 sidecar 端进行，web 前端只需用现有
  `FileBrowserDialog` 选服务器侧目录——web 首次获得可用的批量导入
  （拖放仍是 Electron 独有，但不再是唯一入口）。
- **MCP 工具**：`scan_folder(path) → ImportPlan` / `apply_import(plan)`
  两个新工具，agent 侧的"帮我把这个文件夹整理进库"变成两次调用。

## 3. 待决策（三选一格式）

**D1 · managed 模式（复制进库）怎么处理？**
- A（推荐）：**本期删除死字段语义**，全线 linked + 库根；"复制进库"
  作为独立想法回 inbox，等内测出现真实需求再议。
- B：本期顺带实现"从库外导入时可选复制进 root"。
- C：保持现状（死代码继续躺着）。——反对：审计已定性为误导源。

**D2 · 聚簇/解析跑在哪端？**
- A（推荐）：**后端**（beatos_core 新模块 `ingest_scan/`）。桌面、web、
  MCP、watch 四个消费方共享；规则可测试（纯函数 + pytest 表驱动）。
- B：前端 TS 实现。——反对：MCP 与 watch 用不上，规则重复两份。

**D3 · 变体词表的形态？**
- A（推荐）：内置默认词表 + `app_setting` 可追加（不做 UI，先给 MCP/
  设置 JSON 改），词表命中记进 ImportPlan 便于调试。
- B：写死。——够 MVP 但社区化后必然要开。
- C：完整的规则编辑 UI。——反对：内测前过度工程。

## 4. 验收标准

1. 1000 文件 / 10 GB 的文件夹：**冷扫描出预览 ≤ 15 s**（无全文件哈希）；
   **二次重扫 ≤ 3 s**（纯 stat 路径）。
2. 预览确认后，100 个 beat 的 apply **≤ 30 s**且原子（中途失败不留半库）。
3. 变体聚簇在作者真实曲库上抽查 **≥ 90% 正确**；错簇可在预览表内
   3 次交互内修正。
4. 把整个库文件夹改名后：重指 root 或跑一次 sweep，**0 次手动 relocate**
   恢复全部资产。
5. 同一文件再次导入被标记为重复且默认跳过。
6. 导入后台补全的 sha256 在空闲时完成，期间播放/编辑不受影响。
7. 现有单文件 attach 流程行为不回归（含 mutagen BPM 预填）。

## 5. 非目标（本设计明确不做）

- 音频内容级去重（同曲不同导出 = 不同文件，交给 v0.4 CLAP 相似度）；
- 自动移动/重命名用户文件（"Your files stay put"承诺不变）;
- 跨机同步；规则编辑 UI（见 D3）；对 `docs/`、工程文件（.flp/.als）的
  解析（project_path 字段已存在，watch 阶段再议）。

## 6. 拆分建议（每个 ≤ 10 工作日）

- **Spec-1（后端地基）**：迁移（library_root、file_index、asset 三列）+
  扫描 job + 聚簇/解析纯函数 + apply 端点 + pytest（表驱动的文件名
  fixture 集，拿作者真实曲库文件名当测试数据）。
- **Spec-2（前端 + 收尾)**：导入预览表 UI（虚拟化 + 拖放修簇）+
  拖文件夹/选文件夹入口 + sha 后台队列 + sweep 自动重链 + web 端入口。
- Watch folder 与 MCP 工具各自独立成后续小 spec。

> 下一步：对 D1–D3 做决定（默认取推荐项），然后 `/spec` 把 Spec-1
> 落成正式实现 spec。
