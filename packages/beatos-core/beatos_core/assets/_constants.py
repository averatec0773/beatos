"""Asset role constants for v0.0.4. Separate module to avoid circular imports."""

ASSET_ROLES = frozenset({
    "cover",
    "stems",
    "loop",
    "audio_tagged_mp3",
    "audio_untagged_mp3",
    "audio_tagged_wav",
    "audio_untagged_wav",
})

# Roles that hold a playable/analyzable audio file. `loop` counts as audio
# (v0.0.46) so loop-only tracks are still has_audio, play in the player, and can
# be analyzed for BPM/Key — supporting producers who only ship loops.
AUDIO_ROLES = frozenset({
    "audio_tagged_mp3",
    "audio_untagged_mp3",
    "audio_tagged_wav",
    "audio_untagged_wav",
    "loop",
})
