"""Asset module. Public role constants for v0.0.4.

Audio is split into 4 variants (tagged/untagged × mp3/wav). Adding new
variants in future = extending these sets + updating UI slots.
"""
from beatos_core.assets._constants import ASSET_ROLES, AUDIO_ROLES  # noqa: F401
from .service import OutOfSourceError  # noqa: F401

__all__ = ["ASSET_ROLES", "AUDIO_ROLES", "OutOfSourceError"]
