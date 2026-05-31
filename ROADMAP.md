# BeatOS Roadmap

Pending and future work. Past versions: see [CHANGELOG.md](CHANGELOG.md). Code context: [conventions/architecture.md](conventions/architecture.md).

---

## v0.0.X — Polish and foundation

### v0.0.15 — SHIPPED 2026-05-17

See [CHANGELOG.md](CHANGELOG.md#0015---2026-05-17--auto-save-smoke-housekeeping-producer-management).

### v0.0.16 — SHIPPED 2026-05-18

Tone.js audio engine migration + layout fixes. See [CHANGELOG.md](CHANGELOG.md#0016---2026-05-18--tonejs-audio-engine--layout-fixes).

### v0.0.17 — SHIPPED 2026-05-18

SidebarPanel refactor + top-bar polish. See [CHANGELOG.md](CHANGELOG.md#0017---2026-05-18--sidebarpanel-refactor--top-bar-polish).

### v0.0.18 — SHIPPED 2026-05-18

TrackEditor refactor. See [CHANGELOG.md](CHANGELOG.md#0018---2026-05-18--trackeditor-refactor).

### v0.0.19 — SHIPPED 2026-05-18

smoke.mjs split. See [CHANGELOG.md](CHANGELOG.md#0019---2026-05-18--smokemjs-split).

### v0.0.20 — SHIPPED 2026-05-18

MCP read-only framework. See [CHANGELOG.md](CHANGELOG.md#0020---2026-05-18--stable-mcp-framework).

### v0.0.20.1 — SHIPPED 2026-05-18

Resizer self-heal patch + missed `apps/desktop/package.json` bump. See [CHANGELOG.md](CHANGELOG.md#00201---2026-05-18--resizer-self-heal--missed-desktop-bump).

### v0.0.20.2 — SHIPPED 2026-05-18

MCP `beatos-mcp` console script registration. The v0.0.20 → v0.0.20.1 releases were never actually MCP-usable by an external client; the Claude Desktop dogfood verification caught it. See [CHANGELOG.md](CHANGELOG.md#00202---2026-05-18--mcp-console-script-ship-fix).

### v0.0.21 prerequisites — ALL DONE 2026-05-18

- ✅ `getRepoRoot` IPC (commit `2a35e5e`) — Settings → AI Integration shows real path, no more placeholder.
- ✅ Dead `_MULTI_VALUE` constant removed (commit `2a35e5e`).
- ✅ **Claude Desktop end-to-end verification** (v0.0.20.2) — `beatos` MCP server connects from Claude Desktop; `list_sources` returns the live 4-source library. The first real layer-3 confirmation that the read surface works in a third-party client.

### v0.0.21 — SHIPPED 2026-05-19

First MCP write tool: `create_list` + 2PC activation. SSE-driven Pending Confirmations UI in Settings → AI Integration. See [CHANGELOG.md](CHANGELOG.md#0021---2026-05-19--first-mcp-write-tool-2pc-activation).

### v0.0.21.1 — SHIPPED 2026-05-19

Dropped the `OutOfSourceDialog` chain (asset attach no longer requires a registered Source). Quick-win ahead of v0.0.23 full removal. See [CHANGELOG.md](CHANGELOG.md#00211---2026-05-19--drop-outofsource-attach-guard).

### v0.0.21.2 — SHIPPED 2026-05-19

Sidebar Approvals module + 24h history view. Pending Confirmations UI moved from `Settings → AI Integration` to a dedicated `/approvals` route with yellow count badge. See [CHANGELOG.md](CHANGELOG.md#00212---2026-05-19--sidebar-approvals-module).

### v0.0.21.3 — SHIPPED 2026-05-19

Sidebar polish: list drag-reorder fix + Trash header removal for visual rhythm consistency. See [CHANGELOG.md](CHANGELOG.md#00213---2026-05-19--sidebar-polish-patches).

### v0.0.21.4 — SHIPPED 2026-05-19

Smooth list drag-reorder: disable inner track-drop droppable during list drags so the outer SortableContext shift animation runs cleanly (now matches Source behavior). See [CHANGELOG.md](CHANGELOG.md#00214---2026-05-19--smooth-list-drag-reorder).

### v0.0.22 — SHIPPED 2026-05-19

Source removal — full end-to-end deletion of the `Source` concept (renderer + sidecar + MCP + schema), sidebar reshape (`AllBeatsSection`), `OfflineBadge` repurposed to read `asset.missing`, watcher daemon retired. See [CHANGELOG.md](CHANGELOG.md#0022---2026-05-19--source-removal-full).

### v0.0.23 — SHIPPED 2026-05-19

MCP transport migration: stdio→HTTP bridge via mcp-proxy; FastMCP + annotations; `await_approval`. See [CHANGELOG.md](CHANGELOG.md#0023---2026-05-19--mcp-transport-migration).

---

### v0.0.24 — SHIPPED 2026-05-19

MCP write surface expansion: 12 new tools (lifecycle / curation / metadata / ingest / AI), batch token framework, /approvals preview cards with high-risk variant. See [CHANGELOG.md](CHANGELOG.md#0024---2026-05-19--mcp-write-surface-expansion).

---

### v0.0.25.1 — SHIPPED 2026-05-23

Bulk actions + UX patches: `BulkActionBar`, Cmd+A select-all, TopBar back arrow, Trash multi-select / Empty trash, drag-to-list already-in feedback, text-selection fix. See [CHANGELOG.md](CHANGELOG.md#00251---2026-05-23--bulk-actions--ux-patches).

### v0.0.26 — SHIPPED 2026-05-23

License tiers: one-to-many `license_tier` table replaces `track.license_type` + `track.price`. New TrackEditor section, MCP `set_license_tiers` (whole-list replace, 2PC). See [CHANGELOG.md](CHANGELOG.md#0026---2026-05-23--license-tiers).

### v0.0.26.1 — SHIPPED 2026-05-24

Compact one-row tier layout, FX reference hints, custom name/notes moved behind ⋮ expand. See [CHANGELOG.md](CHANGELOG.md#00261---2026-05-24--compact-tier-rows--fx-hints).

### v0.0.26.2 — SHIPPED 2026-05-24

License editor dogfood fixes: empty tier name accepted, per-currency price memory so currency-peek doesn't wipe value, end-to-end duplicate-deliverables block. See [CHANGELOG.md](CHANGELOG.md#00262---2026-05-24--license-editor-dogfood-fixes).

### v0.0.26.3 — SHIPPED 2026-05-24

License editor redesigned to mirror the FILES section (MP3/WAV/STEMS as fixed preset slots with dashed empty state; "+ Add tier" opens inline custom-row draft). Back-arrow style upgraded. Title-column resizer click no longer collapses the column (3 px movement threshold). Mood/Producer chip rows pinned to `leading-5` so CJK + Latin glyphs align. See [CHANGELOG.md](CHANGELOG.md#00263---2026-05-24--files-style-license-tiers--small-ux-patches).

### v0.0.27.0 — SHIPPED 2026-05-24

Multi-currency license tiers (`price + currency` → `prices` dict) + catalog-level default tier templates auto-applied to new tracks. New `app_setting` key/value table. MCP `set_license_tiers` payload reshaped to use `prices: dict`. See [CHANGELOG.md](CHANGELOG.md#00270---2026-05-24--multi-currency-license-tiers--default-tier-presets).

### v0.0.27.1 — SHIPPED 2026-05-24

Settings → Producers rebuilt as a chip cluster with an inline "+ Add producer" affordance. `known_producers` app_setting lets users pre-register names without a track; the TrackEditor dropdown union-merges this list with distinct-from-tracks values. See [CHANGELOG.md](CHANGELOG.md#00271---2026-05-24--producers-section-chip-cluster--add-from-settings).

#### License v3 candidates (deferred — pending dogfood signal)

- **FX rate refresh**: opt-in network fetch (e.g. `exchangerate.host`) with a manual refresh button, so the snapshot doesn't go stale. Only worth doing if hints feel materially wrong during dogfood.

---

### v0.0.28 — SHIPPED 2026-05-25

Search overhaul: server-side full-catalog search, shared `beatos_core.tracks.query_parser` (HTTP `?query=` + MCP `search_tracks` → agent==human), `field:value` syntax with chip absorption, empty-state dropdown (recent searches / top facet chips / recently added). See [CHANGELOG.md](CHANGELOG.md#0028---2026-05-25--search-overhaul).

---

## Unscheduled — someday, no committed version

Features we want but haven't tied to a release. Promote to a numbered version when a dogfood signal or product decision makes one urgent.

### CI/CD

**Basic gate SHIPPED** (post-v0.0.32, `.github/workflows/ci.yml`): GitHub Actions on push-to-main / PR — `python` job (`uv sync` + `pytest`) and `desktop` job (`npm ci` + lint + typecheck + vitest + `electron-vite build`). Actions pinned to node24 majors. This closed the clean-checkout reproducibility gap and the audit's #1 finding (tests were unenforced). Lint was made green and gated (errors fail, ~52 advisory warnings allowed).

Deferred (TBD — no committed version):

- **Electron smoke in CI** — `npm run smoke` needs a virtual display (xvfb), the Python sidecar env, and a packaged build; it's the most flake-prone. Add a `smoke` job (ubuntu + `xvfb-run` + `uv sync` + `npm run build` + `npm run smoke`) once it can run green reliably.
- **Python ruff + mypy** — no Python lint/type-check exists yet (prior audit M1). Add `[tool.ruff]` + `[tool.mypy]` (start with `ignore_missing_imports`, at least cover `beatos_core`) and a step in the `python` CI job.
- **Tighten lint** — optionally re-promote the downgraded advisory rules (explicit-return-type, no-explicit-any, set-state-in-effect) to errors after fixing the ~52 warnings, and/or add `--max-warnings 0`.
- **Release-build automation** (electron-builder matrix + signing) belongs with the first installer distribution, not the gate.

---

### Producer-name canonicalization (dogfood finding — unscheduled)

Observed: an MCP `create_tracks` call ended up with `"AVERATEC"` and `"averatec"` coexisting as separate distinct producers (visible in Settings → Producers list). The renderer's `ChipMultiSelect` `allowCustomAdd` lowercases custom input, but agent-side calls bypass that path and store whatever casing the agent wrote. Same risk for genre/mood multi-value fields.

Decision points before implementing:
- **Where to canonicalize**: write-side (normalize at HTTP/MCP boundary so DB never holds two casings) vs read-side (case-insensitive merge in `list_distinct_values` + chip rendering). Write-side is cleaner but needs a one-shot migration to collapse existing duplicates.
- **Canonical form**: lowercase (matches renderer's `allowCustomAdd` path) vs first-seen casing (preserves the user's intent, but ambiguous when two are introduced at once) vs Title Case (display-friendly).
- **Scope**: producer only, or also genre/mood/key? The same multi-value-text drift applies to all three; one fix should probably cover all of them.

Tie this to the Settings Producers UI work — that section is the natural place to show "Merge duplicates" affordance during the transition.

---

## v0.1.0 — Catalog → publish-ready — SHIPPED

Both originally-planned features are now delivered:

- **essentia audio analysis** — SHIPPED v0.0.29/v0.0.30. Replaced librosa with Essentia BPM/Key pipeline (8/8 vs 7/8 accuracy, ~6× faster). Made pluggable: `BEATOS_ANALYSIS_ENGINE=librosa|essentia`; Essentia is an opt-in AGPL extra (`uv sync --extra essentia`). Failed-analysis cache fix also in v0.0.30. See [CHANGELOG.md](CHANGELOG.md#0029---2026-05-26--audio-analysis-engine-librosa--essentia).
- **Export / metadata packs** — SHIPPED v0.0.34. Per-track platform-shaped metadata export (NetEase first) with field-by-field copy UI; reachable from right-click menu and TrackEditor toolbar. `beatos_core/export/` service + `GET /api/tracks/{id}/export` + `GET /api/export/platforms` HTTP routes + MCP read tools `export_metadata` + `list_export_platforms` (tool count 22→24, same service as HTTP so agent==human). `beatos-platforms` is now an importable package with generated NetEase en→zh genre/mood vocab maps. See [CHANGELOG.md](CHANGELOG.md#0034---2026-05-29--export--metadata-packs).

> **Metadata canonicalization** (the `AVERATEC`/`averatec` drift) stays in Unscheduled. It surfaces in export packs — promote it if it causes friction during the v0.2.0 NetEase adapter work.

---

## v0.2.0 — First publish adapter (NetEase Cloudmusic)

> **Implementation approach updated** (feat/platform-inject-extension). The original Playwright/CDP sketch (`beatos-core/adapters/` + `--remote-debugging-port=9222`) is superseded by a browser-extension + fixed-port sidecar design. See `apps/extension/README.md`.

### Phase 1 — browser-extension form-filling (IMPLEMENTED, feat/platform-inject-extension)

- **Sidecar inject port**: fixed port **48923** (`BEATOS_INJECT_PORT`). The sidecar exposes `POST /api/inject/stage` (write metadata slot) and `GET /api/inject/form-map/{platform}` (serve selector maps). If 48923 is already in use at startup, extension upload is disabled that session (main app unaffected).
- **ExportDialog trigger**: "发送到上传页" button in the per-track 导出 dialog stages metadata to the port, then opens the platform URL in the default browser.
- **Browser extension** (`apps/extension/`): content script polls the staging slot, fills matched fields via selectors, shows an overlay (filled count + unmatched fields + which audio file to drag). The extension **never submits** — the user drags the audio file and clicks submit.
- **Selector maps as data**: field→CSS-selector mappings live in `packages/beatos-platforms/data/netease/upload-form.json`, served via `GET /api/inject/form-map/netease`. NetEase page redesigns only require updating the JSON — no extension reload needed.
- **NetEase only** for Phase 1. Vocab maps at `packages/beatos-platforms/` already cover genre/mood translation.
- The empty `beatos-core/adapters/` stub is unused; the Playwright/CDP path is abandoned.

### Phase 2-B — custom-widget click-interaction fill (IMPLEMENTED, v0.0.38)

- Typed async "widget drivers" in `apps/extension/src/interaction-fill.ts` fill the click-to-open Ant widgets: `antv3-select` (曲风), `key-triple` (音名/调号/调式 via `key-decompose.ts`), `tag-modal` (说明标签), `license-modal` (价格). Triggers resolve by stable `data-ne2e-name` anchors.
- Reference DOM snapshot for future calibration: `apps/extension/reference/netease-upload-page.html`.

### Phase 2-B fixes — verified live via Playwright (DONE, v0.0.39)

All three reported failures were root-caused by driving the real logged-in NetEase page with the Playwright MCP (not a static snapshot, which lacks the modals/drawer entirely):

- **调式 race fixed**: dropdowns accumulate because Ant v3 only closes on a *trusted* outside click (a content script can't emit one), so a stale open dropdown satisfied the wait instantly and the option scan raced ahead of 调式's render. `pickAntOption` now scopes to each trigger's own dropdown via `aria-controls` + polls for the target option. Value commits; the dropdown still cosmetically lingers (unavoidable).
- **说明标签 fixed**: the modal is a vertical-tab widget (适用场景/情绪表达/自定义); `tag-modal` now switches tabs to find moods under 情绪表达.
- **价格 fixed (best-effort)**: 授权设置 is a right-side **drawer** (not `.ant-modal`), multi-step — `license-modal` opens it, checks the configured license type (default 租赁授权), and fills the first tier's 售价. Never clicks 保存 (human reviews the sub-tier matrix + submits).

### Next-step fixes (Phase 2-B follow-ups, unscheduled)

- **价格 multi-tier**: map BeatOS's multiple tiers onto NetEase's fixed sub-tier matrix (MP3 / MP3+WAV / +分轨) rather than filling only the first 售价 row.
- **说明标签 自定义 tab**: also push unmatched moods into the 自定义标签 free-text input (currently only matches the fixed 适用场景 + 情绪表达 buttons).

### Phase 2-C — upload templates + single-track album (templates SHIPPED v0.0.40, refined v0.0.41)

**Templates + single-album name shipped in v0.0.40** — see CHANGELOG. Three `{}` templates (专辑名 / Beat 名称 / Beat 说明) + producer credit, configured in Settings → 上传模板, stored in `app_setting["upload_templates"]`, rendered by the pure `beatos-core/export/templates.py` and threaded through `netease.render`; the extension fills 专辑名 as a native field + shows a cover reminder. Decided during brainstorming: **every beat = a single-track album**, so NO album entity / migration / new track field — the album name is just another template. The `{ARTIST}` idea was dropped (the producer writes the reference artist into `{title}` or the template literal).

**Refined in v0.0.41** (Subproject B): `{prod}` now resolves from `track.producer` (joined by a configurable `prod_separator`, default ` x `; the Settings `prod` field is fallback-only). Added a `album_description` template (default `{publish date} Prod.{prod}`, filled into the 专辑描述 textarea) and a `{publish date}` token (`YYYY-MM-DD`, export day, service-injected). Token regex widened to allow spaces in `{...}`.

**Subproject A — license-tier price + share (NEXT, brainstormed separately):** give `license_tier` a share/分成 field (append-only migration; price already exists as `prices: dict`). Render price + share per NetEase sub-tier row (MP3 / MP3+WAV / +分轨) in the 授权设置 drawer — the drawer's matrix is `selectorSubItem--1vBQj` rows, each with a 售价 `input` + a 编曲分润比例 `input` (confirmed live 2026-05-30). The `default_license_tiers` setting continues to seed new tracks.

Remaining Phase 2-C follow-ups (future):
- **Album cover auto-carry**: BeatOS knows the track's `cover_asset_id` but the extension can't inject a local file into a file input (and must never auto-submit) — today it's a manual drag + overlay reminder. A future path could expose the cover file to the producer more directly.
- **Album type / 版本 / 发行日期**: still filled manually on the page; could be added to the recipe/templates if they turn out to need automation.

### Phase 2-A — MCP tool + multi-platform (pending)

- MCP `inject_to_platform` tool with 2PC approval (`token` → `await_approval`), consistent with the existing write-surface pattern (the staging slot + extension consumer already exist; this just adds the AI trigger).
- Additional platforms via data-driven selector maps in `beatos-platforms/data/{platform}/upload-form.json`.
- Spec hooks: `docs/superpowers/specs/future-netease-license-model.md`.

---

## v0.3+ — Future (deferred until the publish adapter ships)

### v0.3 — Self-corpus RAG (writing assistance)

- Embed each track's user-authored `description` with a small local model (`bge-small-en` or `mxbai-embed-large` via Ollama).
- Store vectors in `sqlite-vec` extension on the same SQLite file.
- MCP tool `draft_description(track_id) → token`: k-NN over existing descriptions + few-shot LLM to produce a draft in the user's voice. Token approved in `/approvals` (the 2PC review is the staging gate; no separate draft column).

### v0.4 — Audio-content RAG

- CLAP (LAION) embeddings per track audio.
- `find_similar(track_id, k=5)` MCP tool: surface library tracks most like a given one.
- `suggest_tags(track_id)` via k-NN over already-tagged tracks.

### v0.5 — DAW export integration

- Watch FL Studio / Ableton / Logic render output directories.
- Auto-create draft tracks on render completion.
- Pre-fill BPM / key from project metadata when available.

### v0.6+ — More adapters

- Airbit, Tracklib, SoundCloud, Bandcamp, BeatStars.
- Adapter contribution guide.

### v1.0 — Decisions still open

- Build / not build an in-app agent chat panel.
- Build / not build smart collections (Lightroom-style).
- Library sync across devices — almost certainly no.

---

## Roadmap principles

- One PR / branch = one version. No phase-crossing.
- Every version produces a runnable, demonstrable app — no half-shipped features.
- Refactor lives in its own version, never bolted onto a feature commit.
- Anything not on this list is YAGNI until requested.
