# beatos-mcp

MCP facade exposing the running BeatOS app to AI clients (Claude Desktop, Claude Code, Codex, Cursor, etc.).

The actual FastMCP server runs inside the BeatOS sidecar at `/mcp`. The
`beatos-mcp` console script is a stdio launcher: it reads the running sidecar's
handshake file, validates liveness, then execs `mcp-proxy` to bridge stdio
clients to the Streamable HTTP endpoint.

## What this gives you

24 tools — **9 read** + **15 write** in the free build (29 with Pro, which adds `publish_track`, `publish_status`, `list_publish_platforms`, `publish_session_status` + `list_publish_jobs`). Note `grep -c '@mcp.tool' beatos_mcp/server.py` reports 29: the Pro tools are defined under an `if pro_available()` guard and only register when the engine is present.

MCP write tools obey a global **agent permission policy** (`agent_permission_mode` app setting): `confirm` (default — pending token, human approves in Agent Actions), `auto_approve` (apply immediately, still recorded), or `read_only` (writes refused). See `beatos_mcp/policy.py`.

### Read tools

| Tool | Purpose |
|---|---|
| `ping` | Liveness check |
| `list_tracks(filter?)` | Filter + paginate tracks; mirrors HTTP query params |
| `get_track(id)` | Single track with assets + description fields |
| `list_lists()` | All user + system lists |
| `list_distinct_values(field)` | producer / genre / mood / key vocabulary + counts |
| `search_tracks(query)` | Full-text + structured-token search (`genre:trap`, `bpm:>=140`, …) |
| `list_export_platforms()` | Platforms metadata can be exported for (e.g. `netease`) |
| `export_metadata(track_id, platform)` | One track's metadata shaped for a platform's upload form |
| `await_approval(token)` | Poll the status/result of any write token |

### Write tools (two-phase commit)

Every write tool is phase 1 only: it issues a single-use token. The user approves
in BeatOS → Approvals; the agent then polls `await_approval(token)` for the outcome.
No write tool mutates the DB directly.

`create_list`, `update_list`, `delete_list`, `add_tracks_to_list`,
`remove_tracks_from_list`, `reorder_list`, `create_tracks`, `update_tracks`,
`trash_tracks`, `restore_tracks`, `purge_tracks`, `attach_assets`, `detach_assets`,
`set_license_tiers`, `merge_metadata`.

## Setup

1. Install dependencies from the repo root:

   ```bash
   uv sync
   ```

2. Start BeatOS and leave it running. The launcher exits with
   `BeatOS sidecar not running` if no sidecar handshake exists.

3. Recommended: use the in-app one-click setup. Open BeatOS → Settings →
   AI Integration and click the target client:

   | Client | What BeatOS writes/runs |
   |---|---|
   | Claude Desktop | Merges `mcpServers.beatos` into `claude_desktop_config.json` and writes a `.beatos.bak` backup. |
   | Claude Code | Runs `claude mcp add --transport stdio --scope user beatos -- uv run --directory <repo> beatos-mcp`. |
   | Codex | Merges `[mcp_servers.beatos]` into `~/.codex/config.toml` and writes a `.beatos.bak` backup. |

4. Manual fallback: register the stdio launcher in your MCP client.
   `--directory` must be the absolute repo path.

Claude Desktop / Claude Code JSON:

```json
{
  "mcpServers": {
    "beatos": {
      "command": "uv",
      "args": [
        "run", "--directory", "/absolute/path/to/beatos/repo",
        "beatos-mcp"
      ]
    }
  }
}
```

Codex `config.toml`:

```toml
[mcp_servers.beatos]
command = "uv"
args = ["run", "--directory", "/absolute/path/to/beatos/repo", "beatos-mcp"]
startup_timeout_sec = 20
tool_timeout_sec = 120
enabled = true
```

The BeatOS Settings → "AI Integration" section also renders both snippets
pre-filled with your actual paths for copy-paste installs.

## Environment

No database environment variable is required for normal use. The sidecar owns
SQLite and advertises its local `/mcp` endpoint through the handshake file. The
launcher forwards the sidecar's local auth token automatically when present.

Logs land at:
- macOS: `~/Library/Logs/beatos/mcp.jsonl`
- Windows: `%APPDATA%\beatos\logs\mcp.jsonl`

## Running locally

```bash
uv run beatos-mcp
```

The launcher speaks JSON-RPC on stdio after `mcp-proxy` takes over. **Never
`print()` from launcher code** — stdout is protocol-only; stray writes will
corrupt the stream and MCP clients may silently disconnect.

## Architecture notes

- `launcher.py` discovers the running sidecar and execs `mcp-proxy`
- `server.py` defines the FastMCP instance mounted by `beatos-http`
- `db.py` opens connections inside the sidecar process; write approval paths use writable connections
- `beatos_core.two_phase` provides token-table helpers for v0.0.21+ write tools
- `tools/*.py` — one file per logical surface, all return `dict` payloads
- `log.py` — structlog → JSONL file + stderr

Tests: `uv run pytest packages/beatos-mcp`.
