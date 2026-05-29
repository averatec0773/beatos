from __future__ import annotations

from pydantic import BaseModel, Field


class ExportField(BaseModel):
    key: str
    label: str
    value: str = ""
    options: list[str] = Field(default_factory=list)
    note: str | None = None


class ExportResult(BaseModel):
    platform: str
    fields: list[ExportField]
