"""Entry point: `python -m beatos_mcp` runs the stdio MCP server.

NOTE: Task 5 will replace this with the mcp-proxy launcher. For now this is a
placeholder that keeps the package importable during the Task 3 transition.
"""
from __future__ import annotations

import asyncio

from mcp.server.stdio import stdio_server

from beatos_mcp.server import mcp


async def _amain() -> None:
    async with stdio_server() as (read_stream, write_stream):
        # Transitional: Task 5 replaces this whole module with the mcp-proxy launcher.
        await mcp._mcp_server.run(
            read_stream, write_stream, mcp._mcp_server.create_initialization_options()
        )


def main() -> None:
    asyncio.run(_amain())


if __name__ == "__main__":
    main()
