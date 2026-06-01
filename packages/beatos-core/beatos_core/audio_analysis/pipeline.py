from mutagen import File as MutagenFile

from .backends import get_backend
from .models import AnalysisRaw


def analyze(audio_path: str) -> AnalysisRaw:
    try:
        mf = MutagenFile(audio_path)
        duration = float(mf.info.length) if mf is not None and mf.info else None
    except Exception:
        duration = None
    # Single decode for both bpm + key (was two full decodes of the same file).
    bpm, bpm_conf, key, key_conf = get_backend().analyze(audio_path)
    return AnalysisRaw(
        bpm=bpm,
        bpm_confidence=bpm_conf,
        key=key,
        key_confidence=key_conf,
        duration_seconds=duration,
    )
