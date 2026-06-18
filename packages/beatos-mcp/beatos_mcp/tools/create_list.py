"""create_list MCP write tool.

Validates the name and routes through `submit_write`, which applies the INSERT
directly (gated by the MCP client's own consent) and records the action in the
agent_action_log. The actual write logic lives in handlers/list_curation.py."""
from __future__ import annotations

from beatos_mcp.policy import submit_write

_MAX_NAME_LEN = 200


async def create_list(name: str) -> dict:
    if not isinstance(name, str):
        raise ValueError("name must be a string")
    if not name.strip():
        raise ValueError("name must not be empty")
    if len(name) > _MAX_NAME_LEN:
        raise ValueError(f"name must be at most {_MAX_NAME_LEN} characters")

    return await submit_write("create_list", {"name": name})
