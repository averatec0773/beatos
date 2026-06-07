# beatos-mcp

stdio MCP server exposing the BeatOS library to AI clients (Claude Desktop, Cursor, etc.).

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

## Configure Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "beatos": {
      "command": "uv",
      "args": [
        "run", "--directory", "/absolute/path/to/beatos/repo",
        "beatos-mcp"
      ],
      "env": {
        "BEATOS_DB_PATH": "/absolute/path/to/your/beatos.db"
      }
    }
  }
}
```

The BeatOS Settings → "AI Integration" section renders this snippet
pre-filled with your actual paths; copy-paste it from there.

## Environment

| Var | Required | Purpose |
|---|---|---|
| `BEATOS_DB_PATH` | yes | Absolute path to your `beatos.db` |

Logs land at:
- macOS: `~/Library/Logs/beatos/mcp.jsonl`
- Windows: `%APPDATA%\beatos\logs\mcp.jsonl`

## Running locally

```bash
BEATOS_DB_PATH=/path/to/beatos.db uv run beatos-mcp
```

The server speaks JSON-RPC on stdio. **Never `print()` from any code reachable
by the server** — stdout is protocol-only; stray writes will corrupt the
stream and Claude Desktop will silently disconnect.

## Architecture notes

- `db.py` opens read-only connections (`PRAGMA query_only=1`)
- `beatos_core.two_phase` provides token-table helpers for v0.0.21+ write tools
- `tools/*.py` — one file per logical surface, all return `dict` payloads
- `log.py` — structlog → JSONL file + stderr

Tests: `uv run pytest packages/beatos-mcp`.
