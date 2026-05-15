"""List Pydantic model — collections that contain tracks."""
from __future__ import annotations

import datetime as _dt
from typing import Literal

from pydantic import BaseModel

ListKind = Literal["system", "user", "beattape"]


class List(BaseModel):
    """A collection of tracks. 'system' is auto-created ('All Beats')."""

    id: int
    name: str
    kind: ListKind = "user"
    position: int = 0
    created_at: _dt.datetime

    model_config = {"from_attributes": True}


class ListCreate(BaseModel):
    name: str
    kind: ListKind = "user"


class ListUpdate(BaseModel):
    """Partial update payload."""

    model_config = {"extra": "forbid"}

    name: str | None = None
    position: int | None = None
