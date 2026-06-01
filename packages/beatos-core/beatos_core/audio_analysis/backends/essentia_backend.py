"""Essentia analysis backend (optional, AGPL-3.0).

Best accuracy + speed (won the catalog benchmark). Only importable when the
`essentia` extra is installed; the dispatcher falls back to librosa otherwise.
Bundling this in a distributed build triggers AGPL — see NOTICE.
"""
import essentia.standard as es

from .._constants import MAX_DURATION_SECONDS

ANALYSIS_SAMPLE_RATE = 44100  # RhythmExtractor2013 / KeyExtractor expect 44.1 kHz

# Key profile. "bgate" won the catalog benchmark (8/8 on the producer's own
# tracks), beating "edma" and "krumhansl" on minor-key trap/rage material.
KEY_PROFILE = "bgate"

# RhythmExtractor2013 (multifeature) confidence is on a [0, 5.32] scale whose
# documented "good" band starts around 1.5. Map raw 1.5 -> 1.0 so reliable
# detections clear the renderer's autofill bar and shaky grids fall below it.
RHYTHM_CONFIDENCE_GOOD = 1.5


def _load(audio_path: str):
    """Decode mono audio at 44.1 kHz, capped at MAX_DURATION_SECONDS."""
    audio = es.MonoLoader(filename=audio_path, sampleRate=ANALYSIS_SAMPLE_RATE)()
    return audio[: int(ANALYSIS_SAMPLE_RATE * MAX_DURATION_SECONDS)]


def _bpm_from_audio(audio) -> tuple[float | None, float]:
    if len(audio) == 0:
        return None, 0.0

    try:
        bpm, _beats, confidence, _estimates, _intervals = es.RhythmExtractor2013(
            method="multifeature"
        )(audio)
    except Exception:
        return None, 0.0

    conf = max(0.0, min(1.0, float(confidence) / RHYTHM_CONFIDENCE_GOOD))
    return float(bpm), conf


def _key_from_audio(audio) -> tuple[str | None, float]:
    if len(audio) == 0:
        return None, 0.0

    try:
        key, scale, strength = es.KeyExtractor(
            profileType=KEY_PROFILE, sampleRate=ANALYSIS_SAMPLE_RATE
        )(audio)
    except Exception:
        return None, 0.0

    if not key or not scale:
        return None, 0.0

    return f"{key} {scale}", max(0.0, min(1.0, float(strength)))


def analyze_bpm(audio_path: str) -> tuple[float | None, float]:
    """Returns (bpm, confidence) in [0,1]. (None, 0.0) on failure."""
    try:
        audio = _load(audio_path)
    except Exception:
        return None, 0.0
    return _bpm_from_audio(audio)


def analyze_key(audio_path: str) -> tuple[str | None, float]:
    """Returns (key, confidence) in [0,1]. (None, 0.0) on failure. Key formatted 'F# minor'."""
    try:
        audio = _load(audio_path)
    except Exception:
        return None, 0.0
    return _key_from_audio(audio)


def analyze(audio_path: str) -> tuple[float | None, float, str | None, float]:
    """Decode once, compute both bpm and key. Returns (bpm, bpm_conf, key, key_conf)."""
    try:
        audio = _load(audio_path)
    except Exception:
        return None, 0.0, None, 0.0
    bpm, bpm_conf = _bpm_from_audio(audio)
    key, key_conf = _key_from_audio(audio)
    return bpm, bpm_conf, key, key_conf
