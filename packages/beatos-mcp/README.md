# beatos-mcp

stdio MCP server exposing the BeatOS library to AI clients (Claude Desktop, Cursor, etc.).

## What this gives you

| Tool | Purpose |
|---|---|
| `ping` | Liveness check |
| `list_tracks(filter?)` | Filter + paginate tracks; mirrors HTTP query params |
| `get_track(id)` | Single track with assets + description fields |
| `list_lists()` | All user + system lists |
| `list_distinct_values(field)` | producer / genre / mood / key vocabulary + counts |

Read-only as of v0.0.20. Write tools (`import_track`, `confirm_*`, …) ship in
v0.0.21+ on the 2PC token skeleton already shipped here.

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
