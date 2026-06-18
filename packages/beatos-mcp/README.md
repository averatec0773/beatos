# beatos-mcp

MCP facade exposing the running BeatOS app to AI clients (Claude Desktop, Claude Code, Codex, Cursor, etc.).

The actual FastMCP server runs inside the BeatOS sidecar at `/mcp`. The
`beatos-mcp` console script is a stdio launcher that runs an **in-process
stdio↔/mcp proxy**: it always completes the MCP handshake (so clients attach even
when BeatOS is closed), forwarding to the sidecar's Streamable HTTP endpoint when
it is up and serving a degraded `beatos_status` tool when it is not — switching
over automatically (via `tools/list_changed`) when the app starts, no client
restart needed.

## What this gives you

23 tools — **8 read** + **15 write** in the free build (28 with Pro, which adds `publish_track`, `publish_status`, `list_publish_platforms`, `publish_session_status` + `list_publish_jobs`).

MCP write tools apply **directly** under the MCP client's own consent (L1) and are recorded in the `agent_action_log` (surfaced in the Agent Actions dashboard). The one setting, `agent_permission_mode`: `enabled` (default — writes apply) or `read_only` (writes refused). The single chokepoint is `beatos_mcp/policy.py::submit_write` (also the seam for a future elicitation upgrade).

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

### Write tools

Each write tool applies immediately through the `submit_write` chokepoint (gated by
the MCP client's consent; refused under `read_only`) and returns `{status:"applied", result}`.
Every applied write is recorded in the `agent_action_log` for the Agent Actions dashboard.

`create_list`, `update_list`, `delete_list`, `add_tracks_to_list`,
`remove_tracks_from_list`, `reorder_list`, `create_tracks`, `update_tracks`,
`trash_tracks`, `restore_tracks`, `purge_tracks`, `attach_assets`, `detach_assets`,
`set_license_tiers`, `merge_metadata`.

## Setup

1. Install dependencies from the repo root:

   ```bash
   uv sync
   ```

2. Start BeatOS to use the library tools. The launcher attaches whether or not
   BeatOS is running — while it is closed only `beatos_status` is exposed; the
   full toolset appears automatically once you open the app.

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

The launcher speaks JSON-RPC on stdio (the in-process proxy in `proxy.py`).
**Never `print()` from launcher/proxy code** — stdout is protocol-only; stray
writes will corrupt the stream and MCP clients may silently disconnect.

## Architecture notes

- `launcher.py` discovers the running sidecar (`discover_sidecar`, non-raising); `proxy.py` is the in-process stdio↔/mcp proxy (resilient attach + reconnect)
- `server.py` defines the FastMCP instance mounted by `beatos-http`
- `db.py` opens connections inside the sidecar process; write approval paths use writable connections
- `beatos_core.two_phase` provides token-table helpers for v0.0.21+ write tools
- `tools/*.py` — one file per logical surface, all return `dict` payloads
- `log.py` — structlog → JSONL file + stderr

Tests: `uv run pytest packages/beatos-mcp`.
