"""Asset role constants for v0.0.4. Separate module to avoid circular imports."""

# Promo/marketing video assets — used to publish to video platforms (抖音/视频号/
# B站…). Fixed aspect slots, one per (track, role). NOT in AUDIO_ROLES: video is
# not BPM/key-analyzable and the attach metadata-prefill must not run for it.
PROMO_VIDEO_ROLES = frozenset({
    "promo_video_vertical",
    "promo_video_landscape",
    "promo_video_square",
})

ASSET_ROLES = frozenset({
    "cover",
    "stems",
    "loop",
    "audio_tagged_mp3",
    "audio_untagged_mp3",
    "audio_tagged_wav",
    "audio_untagged_wav",
}) | PROMO_VIDEO_ROLES

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
