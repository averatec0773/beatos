"""Single chokepoint for MCP write tools (L1 confirmation model).

The implementation now lives in `beatos_core.agent_permission` so the MCP server
and the in-app AI chat share ONE audited write path (rule 3). This module is the
MCP-facing alias; MCP write tools keep calling `submit_write(tool_name, payload)`.
The future elicitation upgrade still branches in the core chokepoint.
"""
from __future__ import annotations

from beatos_core.agent_permission import (
    DEFAULT_MODE,
    ENABLED,
    READ_ONLY,
    SETTING_KEY,
    VALID_MODES,
    WritesDisabledError,
    get_permission_mode,
    submit_write,
)

__all__ = [
    "DEFAULT_MODE",
    "ENABLED",
    "READ_ONLY",
    "SETTING_KEY",
    "VALID_MODES",
    "WritesDisabledError",
    "get_permission_mode",
    "submit_write",
]
