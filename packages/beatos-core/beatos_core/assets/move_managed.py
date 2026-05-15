"""Managed Move stub — real implementation lands in v0.0.4.

Calling this raises NotImplementedError; the HTTP layer maps it to 501.
"""
from __future__ import annotations


async def move_asset_to_managed(asset_id: int) -> None:  # noqa: ARG001
    raise NotImplementedError(
        "Move into BeatOS library is not yet implemented (coming in v0.0.4)."
    )
