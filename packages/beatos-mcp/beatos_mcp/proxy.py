"""In-process resilient MCP proxy.

The launcher always completes the MCP handshake by serving a lowlevel stdio
`Server` whose handlers connect to the BeatOS sidecar `/mcp`. When the sidecar is
genuinely offline the proxy serves a single `beatos_status` tool; when it is
online it forwards the real tool list and calls.

Stability (the whole point of this module): a transient connect hiccup must NOT
collapse the toolset to `beatos_status`. `fetch_tools` caches the last-known-good
list, retries on transient errors, and only degrades when the sidecar is truly
offline (no handshake). A background poller emits `tools/list_changed` — retrying
until a client session exists — so clients that don't poll still pick up the full
toolset when the app starts.

Rule 8: nothing here writes stdout — logging goes to file/stderr via
`beatos_mcp.log` / structlog.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

import anyio
import mcp.types as types
import structlog
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.stdio import stdio_server

log = structlog.get_logger("beatos_mcp")

# fetch_tools (idempotent list) retries on transient errors; a tool CALL is never
# retried (a write could have applied before the connection dropped).
_FETCH_ATTEMPTS = 3
_RETRY_DELAY = 0.15  # seconds between fetch attempts; module-level so tests patch it


class UpstreamUnavailable(RuntimeError):
    """Raised when the sidecar /mcp endpoint cannot be reached for a call."""


DEGRADED_TOOL = types.Tool(
    name="beatos_status",
    description=(
        "Report whether the BeatOS desktop app is running and reachable. BeatOS "
        "must be open for the library/catalog tools to appear."
    ),
    inputSchema={"type": "object", "properties": {}, "additionalProperties": False},
)


class UpstreamConnector:
    """Connects to the sidecar /mcp per request, with a last-known-good cache.

    `discover` returns a `SidecarTarget` when BeatOS is up (handshake present and
    healthy), else None. A fresh Streamable HTTP session is opened per request
    (simple + concurrency-safe — no shared long-lived session). The tool list is
    cached so a transient forward failure returns the last-good list instead of
    collapsing the catalog to the degraded `beatos_status` tool.
    """

    def __init__(self, discover):
        self._discover = discover
        self._cached_tools: list[types.Tool] | None = None

    @asynccontextmanager
    async def _session(self, target):
        headers = (
            {"Authorization": f"Bearer {target.token}"} if target.token else None
        )
        async with streamablehttp_client(target.url, headers=headers) as (
            read,
            write,
            _,
        ):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session

    async def _list_once(self, target) -> list[types.Tool]:
        """One connect+initialize+list round-trip. Seam for testing retries."""
        async with self._session(target) as session:
            return (await session.list_tools()).tools

    async def fetch_tools(self) -> list[types.Tool] | None:
        """The real tool list, robust to transient failures.

        - sidecar truly offline (no handshake) -> drop the cache, return None
          (the proxy then serves only `beatos_status`).
        - sidecar up: try `_list_once` up to `_FETCH_ATTEMPTS`; on success cache +
          return; if every attempt fails (but the handshake is still present),
          return the last-good cache rather than degrading — so the catalog does
          not flap to a single tool on a momentary hiccup.
        """
        target = self._discover()
        if target is None:
            self._cached_tools = None
            return None
        for attempt in range(1, _FETCH_ATTEMPTS + 1):
            try:
                tools = await self._list_once(target)
                self._cached_tools = tools
                return tools
            except Exception as e:  # noqa: BLE001 — log + retry, never crash the proxy
                log.info("upstream.fetch_failed", attempt=attempt, error=str(e))
                if attempt < _FETCH_ATTEMPTS:
                    await anyio.sleep(_RETRY_DELAY)
        # Handshake says up but every attempt failed — keep the last-good list.
        log.info("upstream.fetch_exhausted", cached=self._cached_tools is not None)
        return self._cached_tools

    async def call(self, name, arguments) -> types.CallToolResult:
        """Forward a tool call (single attempt — NOT retried: a write may have
        applied before a dropped connection). Raises UpstreamUnavailable when the
        sidecar is offline or the forward fails."""
        target = self._discover()
        if target is None:
            raise UpstreamUnavailable("sidecar offline")
        try:
            async with self._session(target) as session:
                return await session.call_tool(name, arguments)
        except Exception as e:  # noqa: BLE001
            log.info("upstream.call_failed", tool=name, error=str(e))
            raise UpstreamUnavailable(f"call {name} failed: {e}") from e


async def list_tools_payload(conn: UpstreamConnector) -> list[types.Tool]:
    """Real tools when the sidecar is up; the degraded status tool when it is not."""
    tools = await conn.fetch_tools()
    if tools is None:
        return [DEGRADED_TOOL]
    return tools


def _status_text(tools: list[types.Tool] | None) -> str:
    if tools is None:
        return (
            "BeatOS desktop app is not running. Open it, then retry — the library "
            "tools will appear automatically (no client restart needed)."
        )
    return f"BeatOS is running and reachable — {len(tools)} tools available."


async def call_tool_payload(
    conn: UpstreamConnector, name: str, arguments: dict
) -> types.CallToolResult:
    """Answer beatos_status locally; forward every other tool to the sidecar."""
    if name == "beatos_status":
        tools = await conn.fetch_tools()
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=_status_text(tools))],
            isError=False,
        )
    try:
        return await conn.call(name, arguments)
    except UpstreamUnavailable:
        return types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=(
                        "BeatOS is not running, so this tool is unavailable. Open "
                        "the BeatOS desktop app and retry."
                    ),
                )
            ],
            isError=True,
        )


async def poll_availability(probe, notify, *, interval: float = 2.0, _sleep=None):
    """Tell the client (via `notify`) when availability changes — reliably.

    `probe()` returns the current online state. `notify(online)` returns True if it
    actually delivered (a client session existed) or False if it must be retried.
    We only advance `last_notified` once `notify` succeeds, so a change observed
    before the client session is captured is re-tried on later ticks rather than
    lost (the bug that left non-polling clients stuck on the degraded tool).
    """
    sleep = _sleep or anyio.sleep
    last_notified = None
    while True:
        online = bool(probe())
        if online != last_notified:
            if await notify(online):
                last_notified = online
        await sleep(interval)


class SessionHolder:
    """Shares the live ServerSession with the background poller.

    `Server.run` builds its ServerSession internally and never exposes it, so the
    request handlers capture `server.request_context.session` here on first use;
    the poller reads it to emit `tools/list_changed`.
    """

    def __init__(self):
        self.session = None


def make_notifier(holder: SessionHolder):
    """Return `notify(online) -> bool`: sends `tools/list_changed` if a client
    session has been captured (returns True), else defers (returns False) so the
    poller retries once the session exists."""

    async def notify(online: bool) -> bool:
        session = holder.session
        if session is None:
            return False
        await session.send_tool_list_changed()
        return True

    return notify


def build_server(conn: UpstreamConnector, holder: SessionHolder) -> Server:
    """A lowlevel stdio Server that forwards tools/list and tools/call to `conn`."""
    server = Server("beatos")

    @server.list_tools()
    async def _list_tools():
        holder.session = server.request_context.session
        return await list_tools_payload(conn)

    @server.call_tool()
    async def _call_tool(name, arguments):
        holder.session = server.request_context.session
        return await call_tool_payload(conn, name, arguments or {})

    return server


async def run_proxy(handshake_path=None) -> None:
    """Serve the resilient proxy over stdio until the client disconnects."""
    from beatos_mcp import log as _log
    from beatos_mcp.launcher import discover_sidecar

    _log.configure()
    conn = UpstreamConnector(lambda: discover_sidecar(handshake_path))
    holder = SessionHolder()
    server = build_server(conn, holder)
    init_opts = server.create_initialization_options(
        NotificationOptions(tools_changed=True)
    )
    notify = make_notifier(holder)

    def probe() -> bool:
        return discover_sidecar(handshake_path) is not None

    async with stdio_server() as (read, write):
        async with anyio.create_task_group() as tg:
            tg.start_soon(poll_availability, probe, notify)
            await server.run(read, write, init_opts)
            tg.cancel_scope.cancel()  # client disconnected -> stop the poller
