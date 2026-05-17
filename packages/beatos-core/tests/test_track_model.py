"""Tests for Track and TrackUpdate Pydantic models."""
import datetime as _dt

import pytest

from beatos_core.models import Track, TrackUpdate


def test_track_model_supports_producer_and_has_audio():
    t = Track(
        id=1,
        title="x",
        created_at=_dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc),
        updated_at=_dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc),
        producer=["averatec0773"],
        has_audio=True,
    )
    assert t.producer == ["averatec0773"]
    assert t.has_audio is True


def test_track_model_producer_defaults_none():
    t = Track(
        id=1,
        title="x",
        created_at=_dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc),
        updated_at=_dt.datetime(2026, 1, 1, tzinfo=_dt.timezone.utc),
    )
    assert t.producer is None
    assert t.has_audio is False


def test_track_update_accepts_producer():
    u = TrackUpdate(producer=["someone"])
    assert u.producer == ["someone"]


def test_track_update_rejects_has_audio():
    # has_audio is derived, not writable
    with pytest.raises(Exception):
        TrackUpdate(has_audio=True)
