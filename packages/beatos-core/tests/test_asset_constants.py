from beatos_core.assets import (
    ASSET_ROLES,
    AUDIO_ROLES,
    EXT_TO_FORMAT,
    SUPPORTED_AUDIO_FORMATS,
)


def test_asset_roles_set():
    assert ASSET_ROLES == frozenset({
        "cover",
        "stems",
        "loop",
        "audio_tagged",
        "audio_untagged",
        "promo_video_vertical",
        "promo_video_landscape",
        "promo_video_square",
    })


def test_audio_roles_subset():
    assert AUDIO_ROLES == frozenset({
        "audio_tagged",
        "audio_untagged",
        "loop",
    })
    assert AUDIO_ROLES.issubset(ASSET_ROLES)


def test_format_map_covers_supported():
    assert set(EXT_TO_FORMAT.values()) == SUPPORTED_AUDIO_FORMATS
    assert SUPPORTED_AUDIO_FORMATS == frozenset({"wav", "mp3", "flac"})
