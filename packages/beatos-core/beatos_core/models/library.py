"""Library Pydantic model."""
from __future__ import annotations

import datetime as _dt
from pydantic import BaseModel, Field


class Library(BaseModel):
    """A rooted collection of tracks."""

    id: int
    name: str
    root_path: str = Field(description="Absolute path to library root.")
    created_at: _dt.datetime
    is_active: bool = False

    model_config = {"from_attributes": True}
