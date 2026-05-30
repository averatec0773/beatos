import datetime as dt

from beatos_core.models.track import Track
from beatos_core.models.license_tier import LicenseTier
from beatos_core.export.platforms.netease import render
from beatos_core.export.templates import DEFAULT_TEMPLATES

_NOW = dt.datetime(2026, 5, 29, tzinfo=dt.timezone.utc)


def _track(**kw) -> Track:
    base = dict(id=1, title="My Beat", created_at=_NOW, updated_at=_NOW)
    base.update(kw)
    return Track(**base)


def _tmpl(**over):
    t = dict(DEFAULT_TEMPLATES)
    t.update(over)
    return t


def _fields(result):
    return {f.key: f for f in result.fields}


def test_single_genre_maps_to_zh():
    r = render(_track(genre=["Trap Rap"]), [], _tmpl())
    assert _fields(r)["genre"].value == "陷阱说唱"
    assert _fields(r)["genre"].options == []


def test_multi_genre_becomes_options_with_note():
    r = render(_track(genre=["Trap Rap", "Drill"]), [], _tmpl())
    g = _fields(r)["genre"]
    assert g.value == ""
    assert g.options == ["陷阱说唱", "钻头说唱"]
    assert g.note is not None


def test_null_zh_genre_falls_back_to_en():
    r = render(_track(genre=["Boom Bap"]), [], _tmpl())
    assert _fields(r)["genre"].value == "Boom Bap"


def test_mood_over_three_warns():
    r = render(_track(mood=["Happiness", "Cute", "Sweet", "Romantic"]), [], _tmpl())
    m = _fields(r)["mood"]
    assert "幸福" in m.value
    assert m.note is not None


def test_empty_fields_render_blank():
    r = render(_track(), [], _tmpl())
    f = _fields(r)
    assert f["bpm"].value == ""
    assert f["genre"].value == ""


def test_price_lines_cny_first():
    tier = LicenseTier(
        id=1, track_id=1, position=0, name="MP3",
        deliverables=["mp3"], prices={"USD": 8.0, "CNY": 50.0},
        notes=None, created_at=_NOW, updated_at=_NOW,
    )
    r = render(_track(bpm=140), [tier], _tmpl())
    price = _fields(r)["price"].value
    assert price.startswith("MP3: ¥50")
    assert "USD 8" in price


def test_beat_name_rendered_into_title():
    # "Chinese Style" -> "国风" per netease genre-map.json
    r = render(_track(title="仙泉", genre=["Chinese Style"]), [], _tmpl())
    assert _fields(r)["title"].value == '[FREE] "仙泉" - 国风 TYPE BEAT'


def test_album_name_field_present_and_rendered():
    r = render(_track(title="仙泉"), [], _tmpl(album_name="ALBUM {title}"))
    f = _fields(r)
    assert "album_name" in f
    assert f["album_name"].value == "ALBUM 仙泉"


def test_description_uses_template_not_raw():
    r = render(_track(title="仙泉", description="ignored raw"), [], _tmpl(beat_description="Prod.{prod}"))
    assert _fields(r)["description"].value == "Prod.Averatec x Redketch"
