"""Analysis backend selection.

One codebase, one switch: the active engine is whichever is installed.
- `essentia` extra installed  -> Essentia (best accuracy + speed; AGPL).
- otherwise                   -> librosa fallback (permissive, always present).

`BEATOS_ANALYSIS_ENGINE=librosa|essentia` forces a choice (dev/test escape valve).
Each backend exposes `analyze_bpm(path)` and `analyze_key(path)` returning the
same `(value, confidence)` contract, so callers never know which engine ran.
"""
import os

_ENGINE_ENV = "BEATOS_ANALYSIS_ENGINE"


def get_backend():
    """Resolve the active backend module. Cheap to call repeatedly (imports are
    cached in sys.modules); re-evaluated each call so the env override is honored."""
    forced = os.environ.get(_ENGINE_ENV, "").strip().lower()

    if forced == "librosa":
        from . import librosa_backend
        return librosa_backend
    if forced == "essentia":
        from . import essentia_backend  # raises ImportError if the extra isn't installed
        return essentia_backend

    # Auto: prefer Essentia when its package is importable, else fall back.
    try:
        from . import essentia_backend
        return essentia_backend
    except ImportError:
        from . import librosa_backend
        return librosa_backend


def active_engine() -> str:
    """Name of the active engine ('essentia' | 'librosa') — for logging/diagnostics."""
    return "essentia" if get_backend().__name__.endswith("essentia_backend") else "librosa"
