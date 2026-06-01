"""librosa analysis backend (always available, ISC — permissive).

The fallback used when the optional `essentia` extra isn't installed (i.e. the
distributable build). Less accurate on halftime-feel BPM and slower than
Essentia, but carries no copyleft obligations.
"""
import numpy as np
import librosa

from .._constants import MAX_DURATION_SECONDS

DEFAULT_SAMPLE_RATE = 22050

# Krumhansl-Schmuckler key profiles (Cognitive Foundations of Musical Pitch, 1990)
KRUMHANSL_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KRUMHANSL_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Note names. Sharps for major keys, flats for minor (matches Splice picker convention).
NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]


def _load(audio_path: str):
    """Decode mono audio at the analysis sample rate, capped at MAX_DURATION_SECONDS."""
    return librosa.load(audio_path, sr=DEFAULT_SAMPLE_RATE, mono=True, duration=MAX_DURATION_SECONDS)


def _bpm_from_audio(y, sr) -> tuple[float | None, float]:
    if len(y) == 0:
        return None, 0.0

    try:
        _, percussive = librosa.effects.hpss(y)
        # hop_length=256 gives ~0.5 BPM resolution near 120 BPM (vs ~5 BPM at default 512)
        tempo, beats = librosa.beat.beat_track(y=percussive, sr=sr, units="time", hop_length=256)
    except Exception:
        return None, 0.0

    tempo_val = float(np.atleast_1d(tempo)[0])

    if len(beats) < 4:
        return tempo_val, 0.0

    intervals = np.diff(beats)
    if len(intervals) == 0 or np.mean(intervals) == 0:
        return tempo_val, 0.0

    cv = np.std(intervals) / np.mean(intervals)
    confidence = max(0.0, min(1.0, 1.0 - cv * 4.0))
    return tempo_val, float(confidence)


def analyze_bpm(audio_path: str) -> tuple[float | None, float]:
    """Returns (bpm, confidence) in [0,1]. (None, 0.0) on failure."""
    try:
        y, sr = _load(audio_path)
    except Exception:
        return None, 0.0
    return _bpm_from_audio(y, sr)


def _key_from_audio(y, sr) -> tuple[str | None, float]:
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


def analyze_key(audio_path: str) -> tuple[str | None, float]:
    """Returns (key, confidence) in [0,1]. (None, 0.0) on failure."""
    try:
        y, sr = _load(audio_path)
    except Exception:
        return None, 0.0
    return _key_from_audio(y, sr)


def analyze(audio_path: str) -> tuple[float | None, float, str | None, float]:
    """Decode once, compute both bpm and key. Returns (bpm, bpm_conf, key, key_conf)."""
    try:
        y, sr = _load(audio_path)
    except Exception:
        return None, 0.0, None, 0.0
    bpm, bpm_conf = _bpm_from_audio(y, sr)
    key, key_conf = _key_from_audio(y, sr)
    return bpm, bpm_conf, key, key_conf
