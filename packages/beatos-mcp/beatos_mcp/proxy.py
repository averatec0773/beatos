"""In-process resilient MCP proxy.

The launcher always completes the MCP handshake by serving a lowlevel stdio
`Server` whose handlers lazily connect to the BeatOS sidecar `/mcp`. When the
sidecar is offline the proxy serves a single `beatos_status` tool; when it is
online it forwards the real tool list and calls. A background poller fires
`tools/list_changed` so the client refetches when the app appears or disappears.

Rule 8: nothing here writes stdout — logging goes to file/stderr via
`beatos_mcp.log`.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

import anyio
import mcp.types as types
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.stdio import stdio_server


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
    """Lazily connects to the sidecar /mcp for each request.

    `discover` returns a `SidecarTarget` when BeatOS is up, else None. A fresh
    Streamable HTTP session is opened per request and closed immediately — simple
    and robust (no long-lived session to reconnect); the per-call cost is a local
    loopback handshake.
    """

    def __init__(self, discover):
        self._discover = discover

    @asynccontextmanager
    async def _session(self):
        target = self._discover()
        if target is None:
            raise UpstreamUnavailable("sidecar offline")
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

    async def fetch_tools(self) -> list[types.Tool] | None:
        """Real tool list, or None when the sidecar is offline/unreachable."""
        try:
            async with self._session() as session:
                return (await session.list_tools()).tools
        except UpstreamUnavailable:
            return None
        except Exception:  # transient connect/initialize failure -> treat as offline
            return None

    async def call(self, name, arguments) -> types.CallToolResult:
        """Forward a tool call. Raises UpstreamUnavailable when offline."""
        async with self._session() as session:
            return await session.call_tool(name, arguments)


async def list_tools_payload(conn: UpstreamConnector) -> list[types.Tool]:
    """Real tools when the sidecar is up; the degraded status tool when it is not."""
    tools = await conn.fetch_tools()
    if tools is None:
        return [DEGRADED_TOOL]
    return tools


def _status_text(online: bool) -> str:
    if online:
        return "BeatOS is running and reachable."
    return (
        "BeatOS desktop app is not running. Open it, then retry — the library "
        "tools will appear automatically (no client restart needed)."
    )


async def call_tool_payload(
    conn: UpstreamConnector, name: str, arguments: dict
) -> types.CallToolResult:
    """Answer beatos_status locally; forward every other tool to the sidecar."""
    if name == "beatos_status":
        tools = await conn.fetch_tools()
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=_status_text(tools is not None))],
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


async def poll_availability(probe, on_change, *, interval: float = 2.0, _sleep=None):
    """Call `on_change(online: bool)` only when sidecar availability flips.

    `probe()` returns the current online state (e.g. `discover_sidecar(path) is
    not None`). Runs forever; the first observation of `online=True` fires once so
    the client refetches the real tool list after a cold start. Injectable
    `_sleep` keeps the loop testable.
    """
    sleep = _sleep or anyio.sleep
    last = None
    while True:
        online = bool(probe())
        if last is not None and online != last:
            await on_change(online)
        elif last is None and online:
            await on_change(True)
        last = online
        await sleep(interval)


class SessionHolder:
    """Shares the live ServerSession with the background poller.

    `Server.run` builds its ServerSession internally and never exposes it, so the
    request handlers capture `server.request_context.session` here on first use;
    the poller reads it to emit `tools/list_changed`.
    """

    def __init__(self):
        self.session = None


def make_on_change(holder: SessionHolder):
    """Return an `on_change(online)` that asks the client to refetch the tool list.

    No-ops until a request has captured the live session (so a flip that happens
    before the client's first `tools/list` is simply absorbed — the client sees
    the fresh list on that first call anyway)."""

    async def on_change(online: bool) -> None:
        session = holder.session
        if session is not None:
            await session.send_tool_list_changed()

    return on_change


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
    on_change = make_on_change(holder)

    def probe() -> bool:
        return discover_sidecar(handshake_path) is not None

    async with stdio_server() as (read, write):
        async with anyio.create_task_group() as tg:
            tg.start_soon(poll_availability, probe, on_change)
            await server.run(read, write, init_opts)
            tg.cancel_scope.cancel()  # client disconnected -> stop the poller
