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

### CI/CD (deferred)

Deferred — solo project, and the agent runs `build` + tests before every commit/push, so the test-gate value is already covered locally. The one gap CI would close is **clean-checkout reproducibility** (the v0.0.20.2 / v0.0.26.2 class of "works locally, broken from a fresh clone" bug). Cheaper stopgap: run `npm ci && npm run build && npm test` + `uv sync && uv run pytest` from a fresh clone before each minor release. Revisit full CI when distributing installers to others or adding collaborators.

- Planned shape (when revived): GitHub Actions PR gate — `npm run build` + `vitest` (ubuntu — typecheck/bundle/vitest don't need macOS) + `uv run pytest` for backend packages; npm + uv caches.
- Release-build automation (electron-builder matrix + signing) belongs with the first installer distribution, not the gate.

---

### Producer-name canonicalization (dogfood finding — unscheduled)

Observed: an MCP `create_tracks` call ended up with `"AVERATEC"` and `"averatec"` coexisting as separate distinct producers (visible in Settings → Producers list). The renderer's `ChipMultiSelect` `allowCustomAdd` lowercases custom input, but agent-side calls bypass that path and store whatever casing the agent wrote. Same risk for genre/mood multi-value fields.

Decision points before implementing:
- **Where to canonicalize**: write-side (normalize at HTTP/MCP boundary so DB never holds two casings) vs read-side (case-insensitive merge in `list_distinct_values` + chip rendering). Write-side is cleaner but needs a one-shot migration to collapse existing duplicates.
- **Canonical form**: lowercase (matches renderer's `allowCustomAdd` path) vs first-seen casing (preserves the user's intent, but ambiguous when two are introduced at once) vs Title Case (display-friendly).
- **Scope**: producer only, or also genre/mood/key? The same multi-value-text drift applies to all three; one fix should probably cover all of them.

Tie this to the Settings Producers UI work — that section is the natural place to show "Merge duplicates" affordance during the transition.

---

## v0.1.0 — Catalog → publish-ready

Make the catalog actually usable for publishing — without browser automation yet. Two mutually reinforcing, mostly read-side features; the NetEase *automation* adapter that previously held this slot moved to v0.2.0 and will reuse the vocab-translation layer built here. (Search was pulled forward to its own v0.0.28.) Suggested build order: analysis → export (each independently shippable; numbering decided at implementation).

- **essentia audio analysis** — replace/augment the librosa pipeline (`beatos_core/audio_analysis/`) with essentia (named in CHANGELOG v0.0.25), re-enable auto-analyze on import + a "Analyze all unanalyzed" batch action. Fills the mostly-empty BPM/Key fields that search and export both consume. Watch the PyInstaller sidecar bundle size.
- **Export / metadata packs** — per-track + bulk export of the canonical catalog into platform-shaped metadata (copyable text block + CSV/JSON), using `packages/beatos-platforms/<platform>/{genre,mood}-map.json` vocab maps and license-tier `prices_json`. New `beatos_core/export/` service + HTTP route + MCP read tool `export_metadata(track_id, platform)`. This is the direct precursor to the v0.2.0 NetEase automation adapter.

> Not selected for this milestone: **metadata canonicalization (#3)** stays in Unscheduled. Heads-up — dirty multi-value metadata (the `AVERATEC`/`averatec` drift) will surface in the export packs above; promote canonicalization in if it bites during the export work.

---

## v0.2.0 — First publish adapter (NetEase Cloudmusic)

- Adapter abstraction in `packages/beatos-core/beatos_core/adapters/` (currently empty stub).
- NetEase Cloudmusic Beat-upload adapter. Vocab maps already exist at `packages/beatos-platforms/netease/{genre,mood}-map.json` (identity stubs).
- Execution via Playwright CDP against user-launched Chrome on a dedicated profile (`~/.chrome-beatos-profile`, `--remote-debugging-port=9222`).
- "Launch Browser for BeatOS" UI + "Inject" button per track. Progress / validation surfacing in the bottom panel.
- Two-phase commit pattern (built in v0.0.21) reused for `inject_to_platform`.
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
