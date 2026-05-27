import essentia.standard as es

from ._constants import ANALYSIS_SAMPLE_RATE, MAX_DURATION_SECONDS, KEY_PROFILE


def analyze_key(audio_path: str) -> tuple[str | None, float]:
    """Returns (key, confidence) — confidence in [0, 1]. Returns (None, 0.0) on failure.

    Uses Essentia's KeyExtractor with the "bgate" profile (see _constants), which
    won the catalog benchmark over the Krumhansl-template approach we shipped before.
    Key is formatted as e.g. "F# minor" / "Ab major" using Essentia's own spelling.
    """
    try:
        audio = es.MonoLoader(filename=audio_path, sampleRate=ANALYSIS_SAMPLE_RATE)()
    except Exception:
        return None, 0.0

    if len(audio) == 0:
        return None, 0.0

    audio = audio[: int(ANALYSIS_SAMPLE_RATE * MAX_DURATION_SECONDS)]

    try:
        key, scale, strength = es.KeyExtractor(
            profileType=KEY_PROFILE, sampleRate=ANALYSIS_SAMPLE_RATE
        )(audio)
    except Exception:
        return None, 0.0

    if not key or not scale:
        return None, 0.0

    return f"{key} {scale}", max(0.0, min(1.0, float(strength)))
