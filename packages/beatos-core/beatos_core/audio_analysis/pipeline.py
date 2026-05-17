import librosa

from .bpm import analyze_bpm
from .key import analyze_key
from .models import AnalysisRaw


def analyze(audio_path: str) -> AnalysisRaw:
    try:
        duration = float(librosa.get_duration(path=audio_path))
    except Exception:
        duration = None
    bpm, bpm_conf = analyze_bpm(audio_path)
    key, key_conf = analyze_key(audio_path)
    return AnalysisRaw(
        bpm=bpm,
        bpm_confidence=bpm_conf,
        key=key,
        key_confidence=key_conf,
        duration_seconds=duration,
    )
