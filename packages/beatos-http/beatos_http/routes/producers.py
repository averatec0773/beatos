"""/api/producers — bulk management of producer values.

Producer is a JSON-array TEXT column on `track`; values are free-form (the
ChipMultiSelect picker allows custom-add). This route exposes one unified
rewrite operation that covers rename / merge / delete:

- rename:  {"from": ["Drake"],          "to": "drake"}
- merge:   {"from": ["Drake","drake"],  "to": "Drake"}
- delete:  {"from": ["Drake"],          "to": null}

`preview` returns the count of tracks that would be affected without
mutating anything — used by the confirmation dialog.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from beatos_core.tracks.service import (
    count_tracks_with_producer,
    rewrite_producer,
)

router = APIRouter(prefix="/api/producers", tags=["producers"])


class PreviewPayload(BaseModel):
    values: list[str] = Field(default_factory=list)


class PreviewResult(BaseModel):
    affected: int


class RewritePayload(BaseModel):
    model_config = {"extra": "forbid"}
    from_: list[str] = Field(default_factory=list, alias="from")
    to: str | None = None


class RewriteResult(BaseModel):
    affected: int


@router.post("/preview", response_model=PreviewResult)
async def preview(payload: PreviewPayload) -> PreviewResult:
    if not payload.values:
        raise HTTPException(status_code=400, detail="values must be non-empty")
    return PreviewResult(affected=await count_tracks_with_producer(payload.values))


@router.post("/rewrite", response_model=RewriteResult)
async def rewrite(payload: RewritePayload) -> RewriteResult:
    if not payload.from_:
        raise HTTPException(status_code=400, detail="from must be non-empty")
    affected = await rewrite_producer(payload.from_, payload.to)
    return RewriteResult(affected=affected)
