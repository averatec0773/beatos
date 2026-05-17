import pathlib

import pytest

from beatos_core.audio_analysis.bpm import analyze_bpm
from beatos_core.audio_analysis.key import analyze_key
from beatos_core.audio_analysis.pipeline import analyze

FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "click_120bpm_c_major.wav"


def test_bpm_detects_120bpm_within_tolerance():
    bpm, conf = analyze_bpm(str(FIXTURE))
    assert 118.0 <= bpm <= 122.0, f"BPM out of range: {bpm}"
    assert conf >= 0.7, f"BPM confidence too low: {conf}"


def test_key_detects_c_major():
    key, conf = analyze_key(str(FIXTURE))
    assert key == "C major", f"Wrong key: {key}"
    assert conf >= 0.5, f"Key confidence too low: {conf}"


def test_pipeline_returns_analysis_raw():
    result = analyze(str(FIXTURE))
    assert result.bpm is not None
    assert result.key is not None
    assert result.duration_seconds is not None
    assert result.bpm_confidence is not None
    assert result.key_confidence is not None


def test_bpm_handles_silence_gracefully():
    pass
