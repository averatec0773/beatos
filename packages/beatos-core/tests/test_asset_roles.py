import typing

import pytest

from beatos_core.assets._constants import ASSET_ROLES, AUDIO_ROLES, PROMO_VIDEO_ROLES
from beatos_core.models.asset import AssetCreate, AssetRole


def test_asset_role_literal_matches_constant():
    literal_roles = set(typing.get_args(AssetRole))
    assert literal_roles == set(ASSET_ROLES)


@pytest.mark.parametrize("role", sorted(ASSET_ROLES))
def test_asset_create_accepts_every_asset_role(role):
    ac = AssetCreate(role=role, path="/tmp/x")
    assert ac.role == role


@pytest.mark.parametrize("role", sorted(PROMO_VIDEO_ROLES))
def test_asset_create_accepts_promo_video_roles(role):
    ac = AssetCreate(role=role, path="/tmp/promo.mp4")
    assert ac.role == role


def test_asset_create_rejects_unknown_role():
    with pytest.raises(Exception):
        AssetCreate(role="not_a_role", path="/tmp/x")


def test_promo_video_roles_are_asset_roles():
    assert PROMO_VIDEO_ROLES <= ASSET_ROLES
    assert "promo_video_vertical" in ASSET_ROLES
    assert "promo_video_landscape" in ASSET_ROLES
    assert "promo_video_square" in ASSET_ROLES


def test_promo_video_roles_are_not_audio():
    # Video must not enter the audio analysis / BPM-prefill path.
    assert PROMO_VIDEO_ROLES.isdisjoint(AUDIO_ROLES)
