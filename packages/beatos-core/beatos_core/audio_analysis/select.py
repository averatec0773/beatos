from __future__ import annotations

AUDIO_PRIORITY = [
    "audio_tagged_wav",
    "audio_untagged_wav",
    "audio_tagged_mp3",
    "audio_untagged_mp3",
]


def pick_audio_asset(assets):
    """Return the highest-priority non-missing audio asset, or None."""
    available = {a.role: a for a in assets if not a.missing}
    for role in AUDIO_PRIORITY:
        if role in available:
            return available[role]
    return None
