import datetime as dt
import json as _json

from beatos_core.models.track import Track
from beatos_core.export.platforms.douyin import render
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


def test_platform_is_douyin():
    assert render(_track(), [], _tmpl()).platform == "douyin"


def test_title_truncated_to_30_chars():
    long = "x" * 50
    r = render(_track(title=long), [], _tmpl(douyin_title="{title}"))
    assert len(_fields(r)["title"].value) == 30


def test_caption_uses_template_tokens():
    t = _track(title="仙泉", bpm=140, key_signature="F# minor", genre=["Trap"])
    r = render(t, [], _tmpl(), prod="Neo")
    cap = _fields(r)["caption"].value
    assert "仙泉" in cap and "Trap" in cap and "140BPM" in cap and "Prod.Neo" in cap


def test_topics_is_json_list_deduped():
    t = _track(genre=["Trap"], tags=["型beat", "说唱"])
    r = render(t, [], _tmpl(douyin_topics="型beat 说唱伴奏"))
    topics = _json.loads(_fields(r)["topics"].value)
    # first genre + track tags + house tags, '#' stripped, deduped, order-preserving
    assert topics == ["Trap", "型beat", "说唱", "说唱伴奏"]


def test_topics_strips_hash_prefix():
    t = _track(tags=["#型beat"])
    r = render(t, [], _tmpl(douyin_topics=""))
    assert _json.loads(_fields(r)["topics"].value) == ["型beat"]


def test_is_free_field():
    assert _fields(render(_track(is_free=True), [], _tmpl()))["is_free"].value == "1"
    assert _fields(render(_track(is_free=False), [], _tmpl()))["is_free"].value == ""


def test_free_prefix_in_title_when_free():
    r = render(_track(title="X", is_free=True), [], _tmpl(douyin_title="{free}{title}"))
    assert _fields(r)["title"].value == "[FREE] X"
