import essentia.standard as es

from ._constants import ANALYSIS_SAMPLE_RATE, MAX_DURATION_SECONDS, RHYTHM_CONFIDENCE_GOOD


def analyze_bpm(audio_path: str) -> tuple[float | None, float]:
    """Returns (bpm, confidence) — confidence in [0, 1]. Returns (None, 0.0) on failure.

    Uses Essentia's RhythmExtractor2013 (multifeature), which is robust to the
    half/double-time octave errors that librosa's beat_track made on fast,
    halftime-feel beats. None (not 0.0) on failure so a corrupt file is never
    cached as a valid 0 BPM — mirrors analyze_key's contract.
    """
    try:
        audio = es.MonoLoader(filename=audio_path, sampleRate=ANALYSIS_SAMPLE_RATE)()
    except Exception:
        return None, 0.0

    if len(audio) == 0:
        return None, 0.0

    audio = audio[: int(ANALYSIS_SAMPLE_RATE * MAX_DURATION_SECONDS)]

    try:
        bpm, _beats, confidence, _estimates, _intervals = es.RhythmExtractor2013(
            method="multifeature"
        )(audio)
    except Exception:
        return None, 0.0

    conf = max(0.0, min(1.0, float(confidence) / RHYTHM_CONFIDENCE_GOOD))
    return float(bpm), conf
