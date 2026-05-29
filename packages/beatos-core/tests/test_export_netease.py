import datetime as dt

from beatos_core.models.track import Track
from beatos_core.models.license_tier import LicenseTier
from beatos_core.export.platforms.netease import render

_NOW = dt.datetime(2026, 5, 29, tzinfo=dt.timezone.utc)


def _track(**kw) -> Track:
    base = dict(id=1, title="My Beat", created_at=_NOW, updated_at=_NOW)
    base.update(kw)
    return Track(**base)


def _fields(result):
    return {f.key: f for f in result.fields}


def test_single_genre_maps_to_zh():
    r = render(_track(genre=["Trap Rap"]), [])
    assert _fields(r)["genre"].value == "陷阱说唱"
    assert _fields(r)["genre"].options == []


def test_multi_genre_becomes_options_with_note():
    r = render(_track(genre=["Trap Rap", "Drill"]), [])
    g = _fields(r)["genre"]
    assert g.value == ""
    assert g.options == ["陷阱说唱", "钻头说唱"]
    assert g.note is not None


def test_null_zh_genre_falls_back_to_en():
    r = render(_track(genre=["Boom Bap"]), [])
    assert _fields(r)["genre"].value == "Boom Bap"


def test_mood_over_three_warns():
    r = render(_track(mood=["Happiness", "Cute", "Sweet", "Romantic"]), [])
    m = _fields(r)["mood"]
    assert "幸福" in m.value
    assert m.note is not None


def test_empty_fields_render_blank():
    r = render(_track(), [])
    f = _fields(r)
    assert f["bpm"].value == ""
    assert f["genre"].value == ""


def test_price_lines_cny_first():
    tier = LicenseTier(
        id=1, track_id=1, position=0, name="MP3",
        deliverables=["mp3"], prices={"USD": 8.0, "CNY": 50.0},
        notes=None, created_at=_NOW, updated_at=_NOW,
    )
    r = render(_track(bpm=140), [tier])
    price = _fields(r)["price"].value
    assert price.startswith("MP3: ¥50")
    assert "USD 8" in price
