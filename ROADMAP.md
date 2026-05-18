# BeatOS Roadmap

Pending and future work. Past versions: see [CHANGELOG.md](CHANGELOG.md). Code context: [conventions/architecture.md](conventions/architecture.md).

---

## v0.0.X — Polish and foundation

### v0.0.15 — SHIPPED 2026-05-17

See [CHANGELOG.md](CHANGELOG.md#0015---2026-05-17--auto-save-smoke-housekeeping-producer-management).

### v0.0.16+ — Refactor pass (deferred)

Each is its own version to limit blast radius. No bundling with feature work.

- **TrackEditor split** — `routes/TrackEditor.tsx` (~470 lines after auto-save lands) → `useTrackEditorState` hook + `<TrackEditorForm>` component + thin route container.
- **SidebarPanel split + rename** — `routes/SidebarPanel.tsx` (~381 lines) → `components/Sidebar/{SourcesSection,ListsSection,TrashSection}.tsx`. Move out of `routes/` (it's a layout component, not a route).
- **smoke.mjs split** — `apps/desktop/scripts/smoke.mjs` (~1170 lines) → `scripts/smoke/{runner,library,player,editor,trash,sidebar}.mjs`. Preserve assertion order; runner orchestrates.

### v0.0.17+ — Search upgrade (candidate)

- Smart query syntax: `bpm:>140 genre:trap producer:smoke`
- `/api/tracks` already has filter primitives; need parser + chip↔query round-trip.

---

## v0.1.0 — First publish adapter (NetEase Cloudmusic)

- Adapter abstraction in `packages/beatos-core/beatos_core/adapters/` (currently empty stub).
- NetEase Cloudmusic Beat-upload adapter. Vocab maps already exist at `packages/beatos-platforms/netease/{genre,mood}-map.json` (identity stubs).
- Execution via Playwright CDP against user-launched Chrome on a dedicated profile (`~/.chrome-beatos-profile`, `--remote-debugging-port=9222`).
- "Launch Browser for BeatOS" UI + "Inject" button per track. Progress / validation surfacing in the bottom panel.
- Two-phase commit pattern enforced before any MCP exposure of `inject_to_platform`.
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
