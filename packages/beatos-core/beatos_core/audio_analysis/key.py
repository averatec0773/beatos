from .backends import get_backend


def analyze_key(audio_path: str) -> tuple[str | None, float]:
    """Returns (key, confidence) in [0,1]. (None, 0.0) on failure.

    Delegates to the active backend (Essentia if installed, else librosa) — see
    `backends/__init__.py`.
    """
    return get_backend().analyze_key(audio_path)
