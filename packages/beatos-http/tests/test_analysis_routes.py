"""Integration tests for POST /api/tracks/{id}/analyze."""
import pathlib
import shutil

import pytest
from fastapi.testclient import TestClient

from beatos_core.db import run_migrations
from beatos_http.app import create_app

FIXTURE_WAV = (
    pathlib.Path(__file__).parent.parent.parent
    / "beatos-core" / "tests" / "fixtures" / "click_120bpm_c_major.wav"
)


@pytest.fixture(autouse=True)
async def _fresh_db(tmp_path, monkeypatch):
    db_path = tmp_path / "global.db"
    monkeypatch.setenv("BEATOS_DB_PATH", str(db_path))
    await run_migrations(db_path)
    yield


def _client() -> TestClient:
    return TestClient(create_app())


def _create_track(client: TestClient, title: str = "T") -> int:
    return client.post("/api/tracks", json={"title": title}).json()["id"]


def _attach_fixture_wav(client: TestClient, tmp_path: pathlib.Path, track_id: int) -> None:
    dest = tmp_path / "click_120bpm_c_major.wav"
    shutil.copy(FIXTURE_WAV, dest)
    res = client.post(
        f"/api/tracks/{track_id}/assets",
        json={"role": "audio_tagged_wav", "path": str(dest)},
    )
    assert res.status_code == 200, res.text


def test_analyze_track_returns_full_payload(tmp_path):
    client = _client()
    track_id = _create_track(client)
    _attach_fixture_wav(client, tmp_path, track_id)

    res = client.post(f"/api/tracks/{track_id}/analyze")

    assert res.status_code == 200, res.text
    body = res.json()
    assert "asset_id" in body
    assert "sha256" in body
    assert "analyzed_at" in body
    assert body["bpm"] is not None
    assert 115.2 <= body["bpm"] <= 124.8, f"BPM out of range: {body['bpm']}"
    # Synthetic click has a degenerate beat grid -> ~0 confidence; just check it's well-formed.
    assert 0.0 <= body["bpm_confidence"] <= 1.0, f"BPM confidence out of range: {body['bpm_confidence']}"
    assert body["key"] == "C major", f"Wrong key: {body['key']}"
    assert body["key_confidence"] >= 0.5, f"Key confidence too low: {body['key_confidence']}"
    assert body["duration_seconds"] is not None
    assert abs(body["duration_seconds"] - 4.0) < 0.5


def test_analyze_track_no_audio_returns_404(tmp_path):
    client = _client()
    track_id = _create_track(client)

    res = client.post(f"/api/tracks/{track_id}/analyze")

    assert res.status_code == 404
    assert "audio" in res.json()["detail"].lower()


def test_analyze_nonexistent_track_returns_404(tmp_path):
    client = _client()

    res = client.post("/api/tracks/99999/analyze")

    assert res.status_code == 404
    assert "Track not found" in res.json()["detail"]


def test_analyze_second_call_uses_cache(tmp_path):
    """Second POST should return same result (cache hit — no re-analysis)."""
    from unittest.mock import patch
    from beatos_core.audio_analysis.models import AnalysisRaw

    client = _client()
    track_id = _create_track(client)
    _attach_fixture_wav(client, tmp_path, track_id)

    # First call — populates cache.
    res1 = client.post(f"/api/tracks/{track_id}/analyze")
    assert res1.status_code == 200

    # Second call — should hit cache; patch pipeline to confirm it isn't called.
    with patch("beatos_core.audio_analysis.service.analyze") as mock_analyze:
        mock_analyze.return_value = AnalysisRaw(
            bpm=999.0, bpm_confidence=0.0, key="X", key_confidence=0.0, duration_seconds=0.0
        )
        res2 = client.post(f"/api/tracks/{track_id}/analyze")

    assert res2.status_code == 200
    mock_analyze.assert_not_called()
    assert res2.json()["bpm"] == res1.json()["bpm"]
