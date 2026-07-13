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


def test_title_truncation_avoids_latin_word_fragment():
    """P17: a hard [:30] cut sliced "…Chinese Hip Hop型beat" into "…型bea"; the cut
    must back off to a word boundary instead of leaving a latin fragment."""
    r = render(
        _track(title="寒江雪", genre=["Chinese Hip Hop"], is_free=True),
        [],
        _tmpl(douyin_title="{free}{title} {genre_zh}型beat"),
    )
    title = _fields(r)["title"].value
    assert len(title) <= 30
    # No trailing mid-word latin fragment (would end with a partial ASCII run).
    assert not title.endswith("型bea")
    assert title == title.rstrip()  # no trailing space from the backoff


def test_cjk_title_cut_not_backed_off():
    """A pure-CJK overflow has no latin boundary problem — cut at maxlen as-is."""
    r = render(_track(title="字" * 40), [], _tmpl(douyin_title="{title}"))
    assert _fields(r)["title"].value == "字" * 30


def test_topics_collapse_internal_spaces():
    """P17: a multi-word topic breaks the #tag inject at the first space, so
    internal whitespace is collapsed ("Chinese Hip Hop" → "ChineseHipHop")."""
    t = _track(genre=["Chinese Hip Hop"], tags=["Type Beat"])
    r = render(t, [], _tmpl(douyin_topics="说唱"))
    topics = _json.loads(_fields(r)["topics"].value)
    assert topics == ["ChineseHipHop", "TypeBeat", "说唱"]
