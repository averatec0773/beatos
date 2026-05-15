from beatos_core.assets import ASSET_ROLES, AUDIO_ROLES


def test_asset_roles_v004_set():
    assert ASSET_ROLES == frozenset({
        "cover",
        "stems",
        "audio_tagged_mp3",
        "audio_untagged_mp3",
        "audio_tagged_wav",
        "audio_untagged_wav",
    })


def test_audio_roles_subset():
    assert AUDIO_ROLES == frozenset({
        "audio_tagged_mp3",
        "audio_untagged_mp3",
        "audio_tagged_wav",
        "audio_untagged_wav",
    })
    assert AUDIO_ROLES.issubset(ASSET_ROLES)
