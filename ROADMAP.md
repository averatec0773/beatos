# BeatOS Roadmap

Pending and future work only — shipped history lives in [CHANGELOG.md](CHANGELOG.md)
(older series archived under [`changelog/`](changelog/README.md)). Code context:
[conventions/architecture.md](conventions/architecture.md).

Current baseline: **v0.0.50** (2026-07-03 — in-app AI Agent, BeatStars export,
tagged MP3, license PDF, tabbed Settings). BeatOS is a **source-run pre-release**:
one-click launchers exist, signed installers don't yet — that line is v0.1.0.

---

## Next patch (v0.0.51 candidate) — hygiene + audit follow-ups

Small fixes bundled per the fix-bundling rule (one commit, one patch bump).
Landed since 0.0.50 and sitting in `[Unreleased]`: the 2026-07-06 hygiene
bundle (web/desktop DB unification, MCP read parity, ruff baseline + guard
tests, dep cleanup) and the 2026-07-12 publish-workflow audit fixes
(P-series batches 1–2: MCP preview-slot honesty, Pro engine hardening,
`missing_sweep` off-loop, membership FK enforcement).

Still open for this patch (or the next):

- [ ] Repo hygiene: close badge-spam PRs #34/#43, prune the two stale
  `.claude/worktrees/*`, review the 3 major dependabot bumps
  (#53 Tailwind 4 · #55 Vite 8 · #68 TypeScript 6 — manual review, not auto-merge).
- [ ] Publish terminal-state semantics (audit P2, decision ratified):
  `PublishStage.EXPIRED` + `PublishResult.outcome`, stale-job detection,
  cancel-on-delete (Phase D1).
- [ ] Publish session probing + `/api/publish` token gate (audit P3/P20,
  Phase D2); export quality — beatstars `trackType`, douyin title/topics
  (audit P16/P17, Phase D3).

## v0.1.0 — first tagged installers

The release where BeatOS stops being source-run. Scope is packaging &
distribution, not features:

- macOS code signing + notarization (electron-builder `identity` currently null);
  decide on Windows signing.
- Auto-update (electron-updater) + release channel; `publish` config.
- CI installer artifacts (electron-builder matrix) + a Windows sidecar build
  (PyInstaller can't cross-compile).
- `beatos-http` ↔ `beatos-mcp` dependency inversion — http imports
  `beatos_mcp.server` (`app.py`) without declaring it; declare it or move the
  `/mcp` mount composition up. Packaging correctness prerequisite.
- Route code-splitting (`React.lazy` + manualChunks for tone/unicorn) —
  the web chunk is ~1.3 MB with all 8 routes static.
- Electron smoke job in CI (ubuntu + xvfb-run) once it runs green 3× in a row
  locally; the web smoke is already gated.

## Pro track (private `beatos-pro` repo)

- BeatStars publish recipe recalibration (2026-07-12 audit P5, one Rule-B live
  session): preview-track slot, cover Edit-dropdown → Uppy flow, free-download
  checkbox (MDC classes), genre/mood vocab harvest from the live option lists,
  live success signal, dry-run draft auto-delete — then a real dogfood pass.
- 抖音 publish: dogfood with a real promo video (also re-wires `schedule`).
- Pro repo CI (its 124 tests currently run only by hand).
- Engine-native trace instrumentation (`BEATOS_PUBLISH_TRACE`) + platform-
  parametrized `publish-dev.py` v2; drivers dedup refactor (own version).

## Web Phase 3 — remote / LAN access (deferred, no committed version)

Hard prerequisite: confine or disable `/api/fs` for non-local clients (the
whole-disk browse/download is loopback-trust-only today; flagged in
`beatos_http/routes/fs.py`). Then: auth, an upload-based file path (the backend
can't see a remote client's filesystem — the `platform` file methods are the
seam), mobile-responsive layout, `Range` support on `/api/fs/download`.

## Unscheduled

- **Producer-name canonicalization** (`AVERATEC`/`averatec` dogfood drift).
  Decision points: write-side normalization vs read-side merge; canonical form
  (lowercase / first-seen / Title Case); scope (producer only vs genre/mood too).
  Natural home: a "Merge duplicates" affordance in Settings → Producers.
- **mypy** — ruff landed 2026-07-06; typing still open (start with
  `ignore_missing_imports`, cover `beatos_core` first).
- **eslint tightening** — re-promote the ~52 advisory warnings to errors, or
  add `--max-warnings`.
- **`beatos_mcp/log.py` tests** — the stdout-purity rule (rule 8) has no
  regression coverage on the logging config itself.

## v0.3+ — AI depth (after v0.1.0)

- **v0.3 Self-corpus RAG**: embed each track's `description` with a small local
  model (`bge-small-en` or Ollama), vectors in `sqlite-vec`, MCP
  `draft_description(track_id)`. Writes flow through `submit_write` like every
  agent write — the old 2PC/approvals staging no longer exists (PR #61).
- **v0.4 Audio-content RAG**: CLAP embeddings; `find_similar(track_id, k)`;
  `suggest_tags` via k-NN over already-tagged tracks.
- **v0.5 DAW export integration**: watch FL/Ableton/Logic render dirs,
  auto-create draft tracks, prefill BPM/key from project metadata.
- **v0.6+ More adapters**: Airbit, Tracklib, SoundCloud, Bandcamp; adapter
  contribution guide.

## v1.0 — open decisions

- Smart collections (Lightroom-style) — build or not.
- Library sync across devices — almost certainly no.
- ~~In-app agent chat panel~~ — decided and shipped (v0.0.50 AI Agent).

---

## Roadmap principles

- One PR / branch = one version. No phase-crossing.
- Every version produces a runnable, demonstrable app — no half-shipped features.
- Refactor lives in its own version, never bolted onto a feature commit.
- Anything not on this list is YAGNI until requested.
