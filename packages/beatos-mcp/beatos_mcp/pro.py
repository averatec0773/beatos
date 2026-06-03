"""Pro-feature availability — true only when the private beatos-publish engine
(mounted via the packages/pro submodule) is importable."""
from __future__ import annotations

from functools import lru_cache


@lru_cache(maxsize=1)
def pro_available() -> bool:
    try:
        import beatos_publish  # noqa: F401
        return True
    except Exception:  # noqa: BLE001
        return False
