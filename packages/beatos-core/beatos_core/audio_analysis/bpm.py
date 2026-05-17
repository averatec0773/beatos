import numpy as np
import librosa

from ._constants import MAX_DURATION_SECONDS, DEFAULT_SAMPLE_RATE


def analyze_bpm(audio_path: str) -> tuple[float, float]:
    """Returns (bpm, confidence) — confidence in [0, 1]."""
    try:
        y, sr = librosa.load(
            audio_path,
            sr=DEFAULT_SAMPLE_RATE,
            mono=True,
            duration=MAX_DURATION_SECONDS,
        )
    except Exception:
        return 0.0, 0.0

    if len(y) == 0:
        return 0.0, 0.0

    try:
        _, percussive = librosa.effects.hpss(y)
        # hop_length=256 gives ~0.5 BPM resolution near 120 BPM (vs ~5 BPM at default 512)
        tempo, beats = librosa.beat.beat_track(y=percussive, sr=sr, units='time', hop_length=256)
    except Exception:
        return 0.0, 0.0

    tempo_val = float(np.atleast_1d(tempo)[0])

    if len(beats) < 4:
        return tempo_val, 0.0

    intervals = np.diff(beats)
    if len(intervals) == 0 or np.mean(intervals) == 0:
        return tempo_val, 0.0

    cv = np.std(intervals) / np.mean(intervals)
    confidence = max(0.0, min(1.0, 1.0 - cv * 4.0))
    return tempo_val, float(confidence)
