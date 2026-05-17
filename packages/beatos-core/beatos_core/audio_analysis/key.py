import numpy as np
import librosa

from ._constants import (
    KRUMHANSL_MAJOR,
    KRUMHANSL_MINOR,
    NOTES_SHARP,
    NOTES_FLAT,
    MAX_DURATION_SECONDS,
    DEFAULT_SAMPLE_RATE,
)


def analyze_key(audio_path: str) -> tuple[str | None, float]:
    """Returns (key, confidence) — confidence in [0, 1]. Returns (None, 0.0) on failure."""
    try:
        y, sr = librosa.load(
            audio_path,
            sr=DEFAULT_SAMPLE_RATE,
            mono=True,
            duration=MAX_DURATION_SECONDS,
        )
    except Exception:
        return None, 0.0

    if len(y) == 0:
        return None, 0.0

    try:
        harmonic, _ = librosa.effects.hpss(y)
        chroma = librosa.feature.chroma_cqt(y=harmonic, sr=sr)
    except Exception:
        return None, 0.0

    chroma_mean = chroma.mean(axis=1)

    if chroma_mean.sum() == 0:
        return None, 0.0

    chroma_mean = chroma_mean / chroma_mean.sum()

    best_score = -1.0
    best_tonic = 0
    best_mode = "major"

    for tonic in range(12):
        for mode_name, profile in [("major", KRUMHANSL_MAJOR), ("minor", KRUMHANSL_MINOR)]:
            rotated = np.roll(profile, tonic)
            rotated = rotated / rotated.sum()
            score = np.corrcoef(chroma_mean, rotated)[0, 1]
            if score > best_score:
                best_score = score
                best_tonic = tonic
                best_mode = mode_name

    notes = NOTES_FLAT if best_mode == "minor" else NOTES_SHARP
    key_str = f"{notes[best_tonic]} {best_mode}"
    confidence = max(0.0, min(1.0, float(best_score)))
    return key_str, confidence
