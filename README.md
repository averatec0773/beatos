<div align="center">

<img src="apps/desktop/resources/icon.png" width="96" alt="BeatOS" />

# BeatOS

**The operating system for beat producers.**

A local-first desktop library that holds every beat on your hard drive — catalog it once, then ship it to every platform with an AI co-pilot doing the metadata grind for you.

[![version](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/averatec0773/beatos/main/apps/desktop/package.json&query=$.version&label=version&prefix=v&color=7c5cff&style=flat-square)](CHANGELOG.md)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-1f1f1f?style=flat-square)](#install)
[![license](https://img.shields.io/badge/license-Apache--2.0-1f1f1f?style=flat-square)](LICENSE)
[![status](https://img.shields.io/badge/status-pre--release-orange?style=flat-square)](ROADMAP.md)
[![MCP](https://img.shields.io/badge/MCP-Claude%20Code%20%E2%80%A2%20Claude%20Desktop-7c5cff?style=flat-square)](#ai-integration)

</div>

---

<div align="center">
  <br/>
  <img src="screenshots/main.png" alt="BeatOS — library view with sidebar, track list, and Now Focused preview panel" width="1100" />
  <br/>
  <br/>
</div>

## The problem

A working beat producer ends up with hundreds of WAV/MP3 files on disk, two versions of each (tagged + untagged), cover art that isn't always next to the file, and a different metadata vocabulary for every platform:

- **NetEase / QQ Music / Suno / BeatStars / YouTube** — different genre trees, different mood tags, different description lengths, different price models.
- A track that's "Trap" on one site is "Hip Hop · 暗黑" on another, "Aggressive Lo-Fi" on a third, "未分类" on a fourth.
- **Every release means re-typing the same data in a different costume.** Multiply by 50 unfinished beats and 4 platforms — that's 200 metadata blocks to maintain by hand. Which is why most producers just don't publish.

BeatOS fixes this by keeping **one canonical catalog** locally, then letting **either you or an AI agent** translate it into the per-platform metadata block on demand.

## What it does today

<table>
<tr>
<td width="33%" valign="top">

### 1. Local catalog

A real SQLite database for every beat: title, BPM, key, genre (multi-value), mood (multi-value), producer credits, tags, license type, price, description, audio assets (WAV/MP3 × tagged/untagged), cover art. Soft-delete trash with restore. Lists for curation. Rename + merge a producer across every track in one click.

</td>
<td width="33%" valign="top">

### 2. AI co-pilot (MCP)

A first-class **MCP (Model Context Protocol)** server exposes the library to Claude Code, Claude Desktop, and any MCP client. 24 tools (8 read + 16 write), plus a publish tool in the Pro build: read your catalog, draft per-platform descriptions, rename producers, propose batch attachments. Every write goes through a `token → await_approval` flow — the AI proposes, you confirm in the Approvals panel.

</td>
<td width="33%" valign="top">

### 3. Player + analysis

Spotify-style bottom bar (Tone.js + Web Audio). Plays the FLOAT-32 WAVs your DAW actually exports. Four audio roles per track with instant switch; queue follows the visible filter; shuffle + repeat. On-demand BPM/key analysis via a pluggable engine — Essentia (RhythmExtractor2013 + KeyExtractor "bgate") when the optional extra is installed, else the permissive librosa fallback — with per-field confidence scores.

</td>
</tr>
</table>

## AI integration

> **BeatOS is the first beat library built for the AI-agent era.** The MCP surface is not a side feature — it's how publishing is going to scale to 10 platforms without manual labor.

**Verified clients:** Claude Code CLI · Claude Desktop · any MCP client speaking stdio JSON-RPC.

<div align="center">
  <br/>
  <img src="screenshots/mcp-claude-desktop.png" alt="BeatOS surfaced as a Desktop connector in Claude Desktop, with all tools listed under read-only and write/delete permission groups" width="900" />
  <br/>
  <em>BeatOS registered as a Desktop MCP connector in Claude Desktop — read-only tools auto-allowed, writes gated behind approval.</em>
  <br/>
  <br/>
</div>

**Tools shipping today (24 in the free build; +1 publish tool in the Pro build):**

| Surface | Tools |
|---|---|
| **Read** | `list_tracks`, `get_track`, `list_lists`, `list_distinct_values`, `ping` |
| **Lifecycle** | `create_tracks`, `trash_tracks`, `restore_tracks`, `purge_tracks` |
| **Lists** | `create_list`, `update_list`, `delete_list`, `add_tracks_to_list`, `remove_tracks_from_list`, `reorder_list` |
| **Metadata** | `update_tracks`, `merge_metadata` |
| **Assets** | `attach_assets`, `detach_assets` |
| **Flow control** | `await_approval` |

**Why two-phase commit?** Every write tool returns a `token` (preview only) — nothing touches the database. The token surfaces in the **Approvals panel** in BeatOS; you review the diff, then confirm. The agent calls `await_approval` to learn the outcome. **An AI can never silently mutate your catalog**, batch-edit your producer credits, or trash a track without you signing off.

**Why batches?** A folder-import of 50 tracks × 2 audio assets would otherwise be 100 approval clicks. `create_tracks` (≤100), `attach_assets` (≤500), `detach_assets` (≤500) all batch — one token, one click, atomic rollback if any file vanishes mid-approve.

**Example flow** (driven by Claude Code from your terminal):

```text
You:    "Tag every beat above 140 BPM that has no genre with 'Trap' or 'Drill'
         based on the cover art and title. Show me the diff before applying."

Claude: [calls list_tracks(bpm_min=140) → 12 tracks]
        [reads metadata, drafts a patch]
        [calls update_tracks(items=[...]) → returns token abc123]

You:    [opens BeatOS Approvals panel, sees 12 proposed edits with rationale]
        [reviews 3, rejects 1, approves the batch]

Claude: [await_approval → status=approved, applies, reports back]
```

The same pattern will drive per-platform description generation, NetEase publish drafts (v0.1), and self-corpus RAG drafts (v0.2).

## Local-first, by design

| | |
|---|---|
| **No server.** | The sidecar binds `127.0.0.1` on an ephemeral port. Nothing leaves the machine — including conversations with the MCP agent. |
| **No account.** | Single-user. No login, no sync, no cloud. |
| **No telemetry.** | Zero outbound calls from the app itself. |
| **Your files stay put.** | BeatOS references paths; nothing is moved or renamed unless you ask. |
| **Your data is yours.** | One SQLite file under `~/Library/Application Support/BeatOS/` (macOS). Open it with any tool. |

## Install

> Packaged installers will arrive at `v0.1.0` together with the first publish adapter. Until then, run from source — see [Develop](#develop) below.

**Targets:** macOS 12+ · Windows 10+. Linux works for development but isn't a supported install target.

## Develop

**Prerequisites**

- Node ≥22 LTS
- Python 3.11.x
- [`uv`](https://github.com/astral-sh/uv) — `brew install uv` (macOS) or `pipx install uv`

**Setup**

```bash
make sync                              # resolve Python workspace
cd apps/desktop && npm install
```

> **Pro build (publishing).** Publishing is a Pro feature in the private `packages/pro/`
> submodule. With access to it: `git submodule update --init packages/pro`, then
> `uv pip install -e packages/pro/beatos-publish --no-deps` + `uv pip install "patchright>=1.40"`.
> Full steps in [`packages/pro-mount-notes.md`](packages/pro-mount-notes.md). Without it,
> the free build runs normally and greys out the publish entry.

**Run**

```bash
npm run dev:fresh                      # kill orphans + launch Electron + sidecar
npm run logs:tail                      # follow main.log + sidecar.jsonl
```

**Wire up the MCP server (Claude Desktop / Claude Code)**

The MCP server lives at `packages/beatos-mcp` and speaks stdio. Add to your MCP client config:

```json
{
  "mcpServers": {
    "beatos": {
      "command": "uv",
      "args": ["run", "--directory", "/absolute/path/to/beatos", "beatos-mcp"]
    }
  }
}
```

Then `list_tracks` and friends will be available as tools inside Claude.

**Test**

```bash
npx vitest run                         # renderer + main (249 tests)
uv run pytest                          # sidecar (347 tests)
npm run build && npm run smoke         # Playwright _electron end-to-end
```

## Stack

`Electron 39` · `React 19` · `Vite` · `Tailwind` · `Radix UI` · `Zustand` · `TanStack Virtual` · `dnd-kit` · `Tone.js`
`Python 3.11` · `FastAPI` · `aiosqlite` · `structlog` · `mcp` (FastMCP) · `librosa` / `essentia` (optional) · `Playwright`
`SQLite` · `Pydantic v2`

## Repository

```
apps/desktop/              Electron shell + React renderer
packages/
  beatos-core/             Pure Python business logic (no web/RPC deps)
  beatos-http/             FastAPI facade for the renderer
  beatos-mcp/              stdio MCP server for AI agents
  beatos-platforms/        Per-platform vocab maps
  pro/                     Private submodule — Pro features (platform publishing); absent in the free build
conventions/               Architecture and design references
screenshots/               README assets
```

Full architecture notes live in [`conventions/architecture.md`](conventions/architecture.md).

## Roadmap

Currently in the **dogfood phase** — UI/UX patches land as `0.0.X.Y` releases, with `v0.1.0` reserved for the first publish adapter (NetEase Cloudmusic).

Full plan: [`ROADMAP.md`](ROADMAP.md) · Shipped history: [`CHANGELOG.md`](CHANGELOG.md).

## License

Apache License 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

Copyright 2026 Scott Huang ([averatec0773](https://github.com/averatec0773)).

---

<div align="center">

Made by [averatec0773](https://github.com/averatec0773) · [averatec.studio](https://averatec.studio)

</div>
