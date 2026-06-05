from beatos_core.assets._constants import ASSET_ROLES, AUDIO_ROLES, PROMO_VIDEO_ROLES


def test_promo_video_roles_are_asset_roles():
    assert PROMO_VIDEO_ROLES <= ASSET_ROLES
    assert "promo_video_vertical" in ASSET_ROLES
    assert "promo_video_landscape" in ASSET_ROLES
    assert "promo_video_square" in ASSET_ROLES


def test_promo_video_roles_are_not_audio():
    # Video must not enter the audio analysis / BPM-prefill path.
    assert PROMO_VIDEO_ROLES.isdisjoint(AUDIO_ROLES)
