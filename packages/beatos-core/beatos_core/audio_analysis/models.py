from __future__ import annotations
import datetime as _dt
from typing import Optional
from pydantic import BaseModel


class AnalysisRaw(BaseModel):
    bpm: Optional[float]
    bpm_confidence: Optional[float]
    key: Optional[str]
    key_confidence: Optional[float]
    duration_seconds: Optional[float]


class AudioAnalysisResult(BaseModel):
    asset_id: int
    sha256: str
    bpm: Optional[float]
    bpm_confidence: Optional[float]
    key: Optional[str]
    key_confidence: Optional[float]
    duration_seconds: Optional[float]
    analyzed_at: _dt.datetime
