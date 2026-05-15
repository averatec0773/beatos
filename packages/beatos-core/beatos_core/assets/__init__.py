"""Asset module. Public role constants for v0.0.4.

Audio is split into 4 variants (tagged/untagged × mp3/wav). Adding new
variants in future = extending these sets + updating UI slots.
"""

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
