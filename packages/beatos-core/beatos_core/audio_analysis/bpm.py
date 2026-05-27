from .backends import get_backend


def analyze_bpm(audio_path: str) -> tuple[float | None, float]:
    """Returns (bpm, confidence) in [0,1]. (None, 0.0) on failure.

    Delegates to the active backend (Essentia if installed, else librosa) — see
    `backends/__init__.py`.
    """
    return get_backend().analyze_bpm(audio_path)
