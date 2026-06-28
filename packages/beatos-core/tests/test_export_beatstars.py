import datetime as _dt
import json

from beatos_core.export.platforms import beatstars
from beatos_core.models.track import Track
from beatos_core.models.license_tier import LicenseTier

_NOW = _dt.datetime(2026, 1, 1)


def _track(**kw):
    base = dict(
        id=1, title="Nightcrawler", producer=["Averatec"], bpm=140,
        key_signature="A minor", genre=["Trap Rap"], mood=["Dark", "Sad"],
        tags=["memphis", "sasi"], is_free=True, created_at=_NOW, updated_at=_NOW,
    )
    base.update(kw)
    return Track(**base)


def _tier(row_deliverables, usd, **kw):
    return LicenseTier(
        id=kw.get("id", 1), track_id=1, name=kw.get("name", "T"),
        deliverables=row_deliverables, prices={"USD": usd}, share=kw.get("share"),
        created_at=_NOW, updated_at=_NOW,
    )


def test_render_maps_core_fields():
    tiers = [_tier(["mp3"], 20.0), _tier(["wav"], 25.0, id=2), _tier(["stem"], 35.0, id=3)]
    er = beatstars.render(_track(), tiers, {}, prod="Averatec", year=2026, publish_date="2026-01-01")
    f = {x.key: x for x in er.fields}
    assert er.platform == "beatstars"
    assert f["bpm"].value == "140"
    assert f["key"].value == "A minor"
    assert f["genre"].value == "Trap"          # mapped via vocab
    assert f["mood"].value == "Dark / Sad"
    assert f["tags"].value == "memphis sasi"
    assert f["is_free"].value == "1"
    assert f["visibility"].value == "PUBLIC"
    pt = json.loads(f["price_tiers"].value)
    assert {"row": "mp3", "price": 20.0, "share": None} in pt
    assert {"row": "wav", "price": 25.0, "share": None} in pt
    assert {"row": "stem", "price": 35.0, "share": None} in pt


def test_render_no_tiers_is_free_false():
    er = beatstars.render(_track(is_free=False, genre=[], mood=[]), [], {},
                          prod="", year=2026, publish_date="2026-01-01")
    f = {x.key: x for x in er.fields}
    assert f["is_free"].value == ""
    assert f["genre"].value == ""
    assert json.loads(f["price_tiers"].value) == []
