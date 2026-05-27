"""Backend selection + per-backend smoke tests.

librosa is a base dependency (always tested). essentia is an optional extra,
so its tests skip when it isn't installed (e.g. a distributed-profile env).
"""
import importlib.util
import pathlib

import pytest

from beatos_core.audio_analysis.backends import active_engine, librosa_backend

FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "click_120bpm_c_major.wav"

essentia_installed = importlib.util.find_spec("essentia") is not None


def test_librosa_backend_analyzes_fixture():
    bpm, _ = librosa_backend.analyze_bpm(str(FIXTURE))
    assert bpm is not None and 115.0 <= bpm <= 125.0, f"librosa BPM: {bpm}"
    key, _ = librosa_backend.analyze_key(str(FIXTURE))
    assert key == "C major", f"librosa key: {key}"


@pytest.mark.skipif(not essentia_installed, reason="essentia extra not installed")
def test_essentia_backend_analyzes_fixture():
    from beatos_core.audio_analysis.backends import essentia_backend

    bpm, _ = essentia_backend.analyze_bpm(str(FIXTURE))
    assert bpm is not None and 115.0 <= bpm <= 125.0, f"essentia BPM: {bpm}"
    key, _ = essentia_backend.analyze_key(str(FIXTURE))
    assert key == "C major", f"essentia key: {key}"


def test_env_override_forces_librosa(monkeypatch):
    monkeypatch.setenv("BEATOS_ANALYSIS_ENGINE", "librosa")
    assert active_engine() == "librosa"


@pytest.mark.skipif(not essentia_installed, reason="essentia extra not installed")
def test_env_override_forces_essentia(monkeypatch):
    monkeypatch.setenv("BEATOS_ANALYSIS_ENGINE", "essentia")
    assert active_engine() == "essentia"


def test_default_selection_matches_installed(monkeypatch):
    monkeypatch.delenv("BEATOS_ANALYSIS_ENGINE", raising=False)
    # Auto: Essentia when installed, else the librosa fallback.
    assert active_engine() == ("essentia" if essentia_installed else "librosa")
