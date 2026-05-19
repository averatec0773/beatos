<div align="center">

<img src="apps/desktop/resources/icon.png" width="96" alt="BeatOS" />

# BeatOS

**The operating system for beat producers.**

A local-first desktop library for the beats on your hard drive — catalog, play, tag, and (soon) publish without anything leaving your machine.

[![version](https://img.shields.io/badge/version-0.0.21.4-7c5cff?style=flat-square)](CHANGELOG.md)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-1f1f1f?style=flat-square)](#install)
[![license](https://img.shields.io/badge/license-MIT-1f1f1f?style=flat-square)](LICENSE)
[![status](https://img.shields.io/badge/status-pre--release-orange?style=flat-square)](ROADMAP.md)

</div>

---

<div align="center">
  <br/>
  <table>
    <tr>
      <td align="center" width="800" height="360" style="background:#121212;color:#7c5cff;">
        <em>Screenshot placeholder — Library view + bottom player coming soon.</em>
      </td>
    </tr>
  </table>
  <br/>
</div>

## What it does today

<table>
<tr>
<td width="33%" valign="top">

### Catalog

A real database for your beats. Sources watch your existing folders, Tracks carry the metadata, Lists curate selections. Multi-value Producer / Genre / Mood with rename + merge in one click. Soft-delete trash with restore.

</td>
<td width="33%" valign="top">

### Play

Spotify-style bottom bar powered by Tone.js + Web Audio. Four audio roles per track (tagged / untagged × WAV / MP3), instant role-switch, queue follows the visible filter, shuffle + repeat, byte-budgeted LRU cache. Plays the FLOAT-32 WAVs your DAW actually exports.

</td>
<td width="33%" valign="top">

### Tag, automatically

Drop a file → BeatOS auto-fills BPM and Key via a librosa pipeline (HPSS → beat tracking + Krumhansl-Schmuckler). Per-field confidence scores; you stay in control of what gets written.

</td>
</tr>
</table>

## Built for AI agents

A separate MCP (Model Context Protocol) stdio server exposes the library to AI assistants like Claude. Read tools ship today; write tools follow a two-phase `token → confirm_*` commit pattern so an agent can never silently mutate your catalog.

## Local-first, by design

| | |
|---|---|
| **No server.** | The sidecar binds `127.0.0.1` on an ephemeral port. Nothing leaves the machine. |
| **No account.** | Single-user. No login, no sync, no cloud. |
| **No telemetry.** | Zero outbound calls. |
| **Your files stay put.** | Sources reference paths; BeatOS doesn't move or rename anything by default. |

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

**Run**

```bash
npm run dev:fresh                      # kill orphans + launch Electron + sidecar
npm run logs:tail                      # follow main.log + sidecar.jsonl
```

**Test**

```bash
npx vitest run                         # renderer + main (237 tests)
uv run pytest                          # sidecar (258 tests)
npm run build && npm run smoke         # Playwright _electron end-to-end (33 assertions)
```

## Stack

`Electron 39` · `React 19` · `Vite` · `Tailwind` · `Radix UI` · `Zustand` · `TanStack Virtual` · `dnd-kit` · `Tone.js`
`Python 3.11` · `FastAPI` · `aiosqlite` · `structlog` · `mcp` · `librosa` · `Playwright`
`SQLite` · `Pydantic v2`

## Repository

```
apps/desktop/              Electron shell + React renderer
packages/
  beatos-core/             Pure Python business logic (no web/RPC deps)
  beatos-http/             FastAPI facade for the renderer
  beatos-mcp/              stdio MCP server for AI agents
  beatos-platforms/        Per-platform vocab maps (v0.1+ adapters)
conventions/               Architecture and design references
```

Full architecture notes live in [`conventions/architecture.md`](conventions/architecture.md).

## Roadmap

Shipping `v0.0.X` polish releases through the rest of the foundation. Next major milestones:

- **`v0.1.0`** — First publish adapter (NetEase Cloudmusic). Two-phase commit, browser-automation in your own Chrome.
- **`v0.2.0`** — Self-corpus RAG. Draft descriptions in your voice from your own back catalog.
- **`v0.3.0`** — Audio-content RAG. `find_similar` over CLAP embeddings, locally.
- **`v0.4.0`** — DAW export integration (FL Studio / Ableton / Logic).

Full plan: [`ROADMAP.md`](ROADMAP.md) · Shipped history: [`CHANGELOG.md`](CHANGELOG.md).

## License

MIT — see [`LICENSE`](LICENSE).

---

<div align="center">

Made by [averatec0773](https://github.com/averatec0773) · [averatec.studio](https://averatec.studio)

</div>
