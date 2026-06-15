"""Asset module. Public role + format constants.

Roles are semantic (audio_tagged / audio_untagged / loop / stems / cover).
The file format (wav/mp3/flac) is a separate `asset.format` attribute, not part
of the role — adding a format edits SUPPORTED_AUDIO_FORMATS / EXT_TO_FORMAT only.
"""
from beatos_core.assets._constants import (  # noqa: F401
    ASSET_ROLES,
    AUDIO_ROLES,
    EXT_TO_FORMAT,
    SUPPORTED_AUDIO_FORMATS,
)

__all__ = ["ASSET_ROLES", "AUDIO_ROLES", "EXT_TO_FORMAT", "SUPPORTED_AUDIO_FORMATS"]
