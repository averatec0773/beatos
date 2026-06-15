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
    "audio_tagged",
    "audio_untagged",
}) | PROMO_VIDEO_ROLES

# Roles that hold a playable/analyzable audio file. `loop` counts as audio
# (v0.0.46) so loop-only tracks are still has_audio, play in the player, and can
# be analyzed for BPM/Key — supporting producers who only ship loops.
# v0.0.49: format (wav/mp3/flac) is no longer baked into the role; it is a
# separate `asset.format` attribute. A track may hold one semantic role in
# multiple formats — see SUPPORTED_AUDIO_FORMATS and migration 021.
AUDIO_ROLES = frozenset({
    "audio_tagged",
    "audio_untagged",
    "loop",
})

# Single source of truth for audio formats. Adding a format later edits ONLY
# this map (plus the small renderer mirror in audio-resolve.ts) — never a role.
SUPPORTED_AUDIO_FORMATS = frozenset({"wav", "mp3", "flac"})
EXT_TO_FORMAT = {".wav": "wav", ".mp3": "mp3", ".flac": "flac"}
