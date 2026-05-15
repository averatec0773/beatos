from __future__ import annotations

from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, model_validator


class SourceCreate(BaseModel):
    """Input model for creating a Source. Default name = folder basename."""

    name: Optional[str] = None
    root_path: str

    @model_validator(mode="after")
    def _normalize(self) -> "SourceCreate":
        p = Path(self.root_path)
        if not p.is_absolute():
            raise ValueError("root_path must be absolute")
        p = p.resolve()
        self.root_path = str(p)
        if not self.name:
            self.name = p.name or self.root_path
        return self


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    root_path: Optional[str] = None
    position: Optional[int] = None


class Source(BaseModel):
    id: int
    name: str
    root_path: str
    position: int
    created_at: str


SourceStatusLiteral = Literal["online", "offline"]


class SourceStatus(BaseModel):
    source_id: int
    status: SourceStatusLiteral
    last_checked_at: str
