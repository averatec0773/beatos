from __future__ import annotations

# Analysis source preference. Format is now an `asset.format` attribute, so we
# rank on (format, tag-state) instead of format-encoded role names. Order is
# preserved from the pre-decouple AUDIO_PRIORITY (wav before mp3, tagged before
# untagged); flac slots in after wav as the other lossless format.
_FORMAT_RANK = {"wav": 0, "flac": 1, "mp3": 2}
_TAG_RANK = {"audio_tagged": 0, "audio_untagged": 1}


def pick_audio_asset(assets):
    """Return the highest-priority non-missing audio asset, or None."""
    candidates = [
        a
        for a in assets
        if not a.missing and a.role in _TAG_RANK and a.format in _FORMAT_RANK
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda a: (_FORMAT_RANK[a.format], _TAG_RANK[a.role]))
