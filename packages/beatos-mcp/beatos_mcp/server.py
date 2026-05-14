"""Tool registration for the BeatOS MCP server.

The `mcp` Python SDK (≥1.0) exposes a `Server` class to which we attach tool
handlers. v0.0.1 only registers `ping`; full surface arrives in v0.0.5.
"""
from __future__ import annotations

from mcp.server import Server
from mcp.types import TextContent, Tool

from beatos_mcp.tools.ping import ping as _ping

PROTOCOL_VERSION = "2024-11-05"

server = Server("beatos-mcp")


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="ping",
            description="Liveness check — returns pong and the BeatOS version.",
            inputSchema={"type": "object", "properties": {}, "additionalProperties": False},
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "ping":
        payload = await _ping()
        return [TextContent(type="text", text=f"{payload['status']}: {payload['version']}")]
    raise ValueError(f"Unknown tool: {name}")
