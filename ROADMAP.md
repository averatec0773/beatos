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

### Audio engine follow-ups (deferred from v0.0.16)

- **`navigator.mediaDevices.ondevicechange`** handler for headphone plug/unplug — the RAF tick already catches outright AudioContext suspends, but a silent route change without state transition is invisible. Wire up `Tone.getContext().rawContext.addEventListener("statechange", ...)` for redundancy.
- **`window.__beatos.engine()`** gating: currently always-on in production. Either gate behind `import.meta.env.DEV` (and update smoke to drive playback through the store instead) or document it as a stable debug surface.

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

### v0.0.21 — MCP two-phase commit (first write tool)

The 2PC token skeleton (table + `create/verify/consume` helpers) landed in v0.0.20. This version activates it with the first real write tool.

- First write tool: `create_list(name) → confirm_token` / `confirm_create_list(token)`.
- Tests cover: token expiry, double-confirm, wrong-token, concurrent confirm.
- **Renderer side**: Surface pending tokens in Settings → AI Integration ("Pending confirmations" list with Approve / Reject per row). First place this UI lives.

### v0.0.22 — `draft_description` placeholder

Closes the AI-write loop for the description field, even before v0.2 RAG lands. The tool writes only to `track.description_draft` — promoting to `description` is still a user action (see CLAUDE.md rule 1).

- Tool: `draft_description(track_id, text) → token` / `confirm_promote_draft(token)` (the `confirm_*` step writes the draft, not the live description).
- Renderer `TrackEditor` already has the `description_draft` field; surface a "Promote draft → description" affordance.
- Real RAG generation arrives in v0.2; this version validates the write path with a passthrough `text` parameter.

---

### v0.0.23+ — Search upgrade (candidate)

- Smart query syntax: `bpm:>140 genre:trap producer:smoke`
- `/api/tracks` already has filter primitives; need parser + chip↔query round-trip.

---

## v0.1.0 — First publish adapter (NetEase Cloudmusic)

- Adapter abstraction in `packages/beatos-core/beatos_core/adapters/` (currently empty stub).
- NetEase Cloudmusic Beat-upload adapter. Vocab maps already exist at `packages/beatos-platforms/netease/{genre,mood}-map.json` (identity stubs).
- Execution via Playwright CDP against user-launched Chrome on a dedicated profile (`~/.chrome-beatos-profile`, `--remote-debugging-port=9222`).
- "Launch Browser for BeatOS" UI + "Inject" button per track. Progress / validation surfacing in the bottom panel.
- Two-phase commit pattern (built in v0.0.21) reused for `inject_to_platform`.
- Spec hooks: `docs/superpowers/specs/future-netease-license-model.md`.

---

## v0.2+ — Future (deferred until v0.1.0 ships)

### v0.2 — Self-corpus RAG (writing assistance)

- Embed each track's user-authored `description` with a small local model (`bge-small-en` or `mxbai-embed-large` via Ollama).
- Store vectors in `sqlite-vec` extension on the same SQLite file.
- MCP tool `draft_description(track_id)`: k-NN over existing descriptions + few-shot LLM to produce a draft in the user's voice.
- Output lands in `track.description_draft` — user approves to promote. **Never** overwrites `description`.

### v0.3 — Audio-content RAG

- CLAP (LAION) embeddings per track audio.
- `find_similar(track_id, k=5)` MCP tool: surface library tracks most like a given one.
- `suggest_tags(track_id)` via k-NN over already-tagged tracks.

### v0.4 — DAW export integration

- Watch FL Studio / Ableton / Logic render output directories.
- Auto-create draft tracks on render completion.
- Pre-fill BPM / key from project metadata when available.

### v0.5+ — More adapters

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
