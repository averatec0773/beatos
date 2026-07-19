# BeatOS 解法设计评审（2026-07）

> 基于对四个子系统的完整代码审计（数据模型/导入、AI 与音频分析、导出/发布、前端流程），
> 逐功能回答三个问题：**它要解决什么问题？现在怎么解的？更优雅的解法是什么？**
> 姊妹篇：[PRODUCT-ANALYSIS-2026-07.md](PRODUCT-ANALYSIS-2026-07.md)（商业分析）。

## 总诊断：问题不是"逻辑没设计好"，是三个可命名的模式

审计结论先讲清楚一件事：**代码质量和工程纪律不是弱项**——纯函数渲染器、审计
单点 `submit_write`、路径安全处理、MCP proxy 的降级设计，这些都是高水平决策。
真正的弱点集中在三个反复出现的模式上，每个都有名字、都可训练：

1. **原语正确，工作流缺失（built nouns, not verbs）。**
   数据模型几乎每处都对（role×format 槽位、license tier 1:N、软删除），但没有
   从"制作人星期二晚上从 DAW 导出了 6 个文件"这个动作反推流程。结果是：
   模型能表达一个完美编目的 beat，但把 beat *变成*编目状态要 30–50 次交互。
2. **复杂度预算花错了位置。**
   高难度的工程投给了 stealth 浏览器驱动、autosave 防丢失机器、WebGL 背景；
   而十倍杠杆的结构性投资（导入管线、sha256 自动重链）没有做。
   已算出的 sha256 只用于 relocate 校验——去重和自动重链这两个免费的大收益
   躺在手边没人捡。
3. **半途设计残留。**
   `Asset.mode='managed'` 定义了却从未有代码路径写入（死能力）；`schedule`
   字段被非抖音平台静默忽略；legacy 权限模式映射；beatos-platforms README
   和实际数据文件相互矛盾。每一处残留都是未来的误导源。

---

## 逐功能评审

### 1. 导入/编目 —— 最严重的设计缺口

**要解决的问题：** 把散落在硬盘上的几百个 beat（每个 beat 是一簇文件：
tagged/untagged × WAV/MP3、loop、stems、封面）变成结构化目录。

**当前解法（审计事实）：**
- 人类路径只有单曲创建：`POST /api/tracks`（只有 title），然后在编辑器里
  逐槽位点"+ Add file"→OS 选择器（`FileRowsSection.tsx`，4 个默认音频槽 +
  loop/stems/cover 各自独立往返）。
- 拖 N 个文件 = 创建 N 个单资产轨道（`create-track-from-file.ts:60-101`），
  **没有"4 个变体 → 1 个 beat"的路径**；attach 模式硬限单文件。
- 拖放仅 Electron、仅 wav/mp3；web 端完全没有拖放导入。
- 后端不存在任何文件夹扫描端点；MCP `attach_assets` 批量存在但要求调用方
  逐条枚举 `{track_id, role, path}`——是给 agent 的，不是给人的。
- sha256 每次 attach 都算（`hashing.py`），但**没有任何去重**：同内容
  两个路径 = 两条独立资产行。

**为什么这是根问题：** 一个 beat 30–50 次交互 × 几百个 beat，意味着没有
任何内测用户能走到你打磨过的功能。这不是打磨问题，是缺一整个管线。

**更优设计——导入管线作为一等公民（P0）：**

```
选文件夹 → 扫描 → 文件名解析 → 聚簇成 beat → 自动分槽 → 去重 → 预览表格 → 一次确认
```

- **文件名解析**：制作人文件名里通常带 BPM/key（`trap 140bpm Amin.wav`）——
  一组正则 + 词表就能预填你现在要求手输的字段。
- **聚簇**：同一 beat 的变体文件名几乎相同（去掉 `_tagged`/`_untag`/`.mp3`
  后缀比较），按归一化文件名 + 同目录聚簇成候选 beat。
- **自动分槽**：扩展名定 format（`EXT_TO_FORMAT` 已存在），文件名词
  （tagged/tag/clean/untag/loop/stems）定 role；解析不出的进"待定"列
  由用户在预览表格里拖一下。
- **去重免费**：sha256 已经在算——扫描时同 hash 直接标记跳过。
- **落点**：后端一个 `POST /api/import/scan`（dry-run 返回聚簇预览）+
  一个 `POST /api/import/apply`；复用现有 MCP 批量 handler 的 apply 逻辑
  （`handlers/ingest.py`——它已经会应用 creation defaults，而人类创建路径
  反而不会，这个不一致也顺便修掉）。
- 这个管线做完，roadmap v0.5 的 DAW watch-folder 只是"对一个文件夹持续
  跑同一管线"，几乎免费。

### 2. 文件引用模型 —— 正确的哲学，缺失的下半场

**要解决的问题：** 引用而不搬动用户文件（"Your files stay put"是产品承诺）。

**当前解法：** 绝对路径 + 永远 `linked`（`assets/service.py:113`）；
`missing_sweep` 只把 `missing` 翻成 1，恢复靠逐文件手动 relocate，且要求
sha256 完全一致才接受（`service.py:193`）。

**缺陷：** 用户重命名一个文件夹 = 整库失联，几百个文件逐个手点"Find file"。
"尊重你的文件"的哲学做了一半：尊重了文件的位置，没尊重文件会移动的事实。

**更优设计（P1）：**
- **sha256 自动重链**：sweep 发现 missing 后，在用户注册的库根目录里建
  `hash → path` 索引，自动匹配重链，只有 hash 找不到的才要人工。数据全都
  在，缺一个 O(库大小) 的索引循环。
- **library roots**：注册若干根目录，资产存 `(root_id, rel_path)`，
  整库搬迁/换机器 = 重新指一次根目录。这同时解决审计发现的"目录库绑死
  单机"问题（换电脑目录作废）。
- **`managed` 模式二选一**：要么实现（导入时可选"复制进库"），要么删掉
  死代码。悬置状态只会误导未来的你。

### 3. 元数据词表 —— 自由文本在静默漂移

**当前解法：** genre/mood/producer/tags 全是 JSON-in-TEXT（`006` 迁移），
无维表；facet 靠 `json_each` 全表扫描；producer 有 casefold 归一化
（`canonicalize_producers`），genre/mood/tags **零归一化**；多值排序按
`$[0]`（语义任意）。

**诚实评价：** 单机几百曲目下性能其实够用，不必急着做索引优化。真正的
问题是**词表治理**：ROADMAP 里的 `AVERATEC/averatec` 漂移只是症状；
更要命的是导出映射依赖干净的 genre 值——vocab map 是 identity fallback
（`beatstars.py:72`），脏值会一路穿透，直到 BeatStars 表单的 autocomplete
点不中才失败，离错误源头隔了三层。

**更优设计（P2）：** 一张 `term(kind, canonical, aliases)` 维表 + 写路径
归一化 + Settings 里的 merge UI（ROADMAP 已想到 producer merge，应推广到
四种词）。一步同时修复：producer 漂移、tags 碎片化、导出映射脏值穿透。

### 4. 发布 —— 方向该换，且现有代码里藏着插件方案的地基

**当前解法的结构性问题（审计确认）：**
- 双入口漂移：HTTP 路径校验 platform 并注入 `auto_advance`，MCP 路径两者
  都不做（`routes/publish.py:38-64` vs `handlers/publish.py:27-50`），
  两套强引用集合各自维护。
- job/login 全内存，重启即丢，中途重启可能留下无人追踪的真实浏览器进程。
- 路由顺序 load-bearing（catch-all 必须最后声明，靠注释维持）；超时靠
  异常类名字符串判断（`publish_login.py:51`）；`POST /api/publish` 无并发
  上限（连点 N 次 = N 个浏览器）。
- `_price_tiers()` 在 beatstars/netease 渲染器里近乎逐行重复。

**关键发现——插件方案的地基已经建好了：** `ExportResult` 的结构
（`ExportField{key,label,value,options,note}`，`export/models.py`）**天生
就是一份填表指令**：value 直填、options 给人选、note 提示人工步骤。
浏览器插件的架构就是：content script 识别平台上传页 → 从
`127.0.0.1:8765` 拉该曲目的 `export_metadata` → 逐 field 填表 → 用户点
发布。现有三平台 recipe 里最值钱的知识（字段锚点、词表映射、哪个
checkbox 是对的）直接迁移为插件的 per-platform 填表模块；session 管理、
指纹对抗、ToS 灰区、headed/headless 双浏览器管理**整类问题消失**。

**建议路径：** 先用 BeatStars 单平台做一个插件 spike 验证（它是纯网页表单，
最适合）；patchright 引擎保留为兜底不再扩建。无论走哪条路，先做三件收敛：
job 状态落 SQLite（DB 就在那里）、双入口合一为一个 service 函数、
engine 交互收敛为显式接口（消灭字符串判断异常）。

### 5. AI 写入路径 —— 两处真正的架构违规（应立即修）

这是全部审计里唯一"bug 级"的发现：代码库的核心原则是所有 agent 写入走
`submit_write` 单点（有审计日志、受 read_only 约束），但有两条路径绕过了它：

- 批量分析的 autofill 用裸 SQL 直写 `track`（`batch_analysis.py:57`）；
- 批量 AI 打标直接调 `update_track()`（`batch_tagging.py:82`）。

后果：read-only 模式下库仍会被 AI 改动，且 Agent Actions 里查无记录——
这与"每个 AI 写入都被记录"的产品承诺直接矛盾。修法简单（都改走
`submit_write`），价值很高：**这类"承诺与实现不一致"在内测中一旦被用户
发现，损失的是信任而不只是一个 bug。**

### 6. AI 打标与分析 —— 信号选错了

- **AI 打标的输入是封面 + 标题**（`anthropic_provider.py:92-120`），音频
  本身完全不参与。从封面猜 genre 是弱信号，制作人试一次觉得不准就永久
  关掉。且 DeepSeek 无视觉支持时**静默降级为纯标题**，用户不知情；模型
  回复解析失败也静默返回空建议——坏体验被伪装成"没有建议"。
- **两套分析引擎的置信度量纲不可比**：Essentia `raw/1.5` vs librosa
  `1-cv*4`，是两个无关启发式，却共用 0.7/0.6 的 autofill 阈值——换引擎
  会静默改变回填行为；librosa 也未处理 halftime 倍速歧义。

**更优设计：** 真信号在音频里。低成本中间方案：把已有的 BPM/key/时长 +
librosa 频谱特征作为文本上下文喂给 LLM（一天工作量）；正解是 roadmap
v0.4 的 CLAP embedding，建议提前——它同时解锁 find_similar 和 kNN 打标。
另外：降级和解析失败必须显式可见；两引擎阈值各自标定。

### 7. Agent/MCP —— 整体最好的子系统，三个磨点

proxy 的降级/缓存/通知设计是全项目最成熟的部分。剩余磨点：
- 8 轮工具迭代上限到达时**静默截断**返回部分结果——应显式告知"任务未完成"。
- 破坏性确认只存在于 chat 层（`trash_tracks` 暂停确认），MCP 端的
  `purge_tracks` 无对等机制——destructive 语义应下沉到 `submit_write`
  层统一，而不是每个入口各自特判。
- 会话持久化每轮 DELETE+全量重写 `chat_message`；40 条/2000 字符截断
  可能丢模型需要的上下文。低优先级，但记录在案。

### 8. 导出/License PDF/Tagged MP3 —— 做得好，小修即可

这三个是"问题-解法"匹配得最好的功能：纯函数渲染器、绝不改源文件、
Windows 保留名/路径长度处理周全。小修清单：`_price_tiers` 抽到共享模块；
`datetime.now()` 换带时区；identity fallback 加告警字段（脏 genre 在导出
预览时就该看见，而不是在平台表单里失败）；过期 README 更新。

### 9. 前端数据层 —— 手写了一个更差的 TanStack Query

- 无分页，任何筛选/排序/搜索变更全量重拉整库列表（`stores/tracks.ts:188`）。
- 手写 in-flight 去重、版本计数器失效、乐观更新——这些正是 TanStack Query
  的标准能力。
- 编辑器和 license tiers 各自维护一套精巧的 debounce+flush-on-unmount
  防丢失机器——changelog 里的数据丢失 bug 群证明这个模式本身脆弱。
  **当一个模式需要反复打补丁才能不丢数据，该换的是模式**：本地 draft
  state + 显式 mutation 队列，或直接交给 mutation 库。

---

## 优先级汇总（对应 30% 工程预算）

| 级别 | 事项 | 理由 |
|---|---|---|
| **P0** | 导入管线（扫描→解析→聚簇→分槽→去重→预览） | 内测生死线；数据模型无需改动 |
| **P0** | 修复两处 submit_write 旁路 | 半天工作量；承诺一致性 |
| **P1** | sha256 自动重链 + library roots | "尊重文件"哲学的下半场 |
| **P1** | BeatStars 插件 spike（复用 ExportField） | 验证发布新路线，成本一周级 |
| **P2** | term 维表 + merge UI；publish job 落库 + 双入口合一 | 治理债，内测反馈后做 |
| **P2** | TanStack Query 替换手写数据层 | 随下一个大前端功能顺带做 |

## 给"缺经验"的三个解药（可操作）

1. **每个功能先写 user journey 再写 schema。** 一页纸：用户从哪来、手里
   有什么文件、点几次、在哪结束。你的 schema 品味已经够了，缺的是这一页纸。
2. **复杂度预算只花在每周路径上。** 动手前问：这个精巧度是花在用户每周
   都经过的路上，还是花在我觉得有趣的路上？（stealth 浏览器属于后者。）
3. **让 AI 做对抗性架构评审成为节奏。** 本文档就是方法本身：写完一个
   功能，让 AI 以"目标用户 + 苛刻 reviewer"双角色走一遍；每月把 changelog
   的 bug 喂给 AI 找聚类——autosave bug 群指向模式错误、publish session
   bug 群指向方向错误，**bug 的分布就是设计弱点的地图**。
