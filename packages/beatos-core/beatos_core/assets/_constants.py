"""Asset role constants for v0.0.4. Separate module to avoid circular imports."""

ASSET_ROLES = frozenset({
    "cover",
    "stems",
    "audio_tagged_mp3",
    "audio_untagged_mp3",
    "audio_tagged_wav",
    "audio_untagged_wav",
})

AUDIO_ROLES = frozenset({
    "audio_tagged_mp3",
    "audio_untagged_mp3",
    "audio_tagged_wav",
    "audio_untagged_wav",
})
