"""Entry point: `python -m beatos_mcp` runs the stdio MCP server."""
from __future__ import annotations

import asyncio

from mcp.server.stdio import stdio_server

from beatos_mcp.server import server


async def _amain() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


def main() -> None:
    asyncio.run(_amain())


if __name__ == "__main__":
    main()
