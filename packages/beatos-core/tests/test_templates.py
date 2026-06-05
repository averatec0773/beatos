import datetime as dt

from beatos_core.export.templates import DEFAULT_TEMPLATES, render_template
from beatos_core.models.track import Track

_NOW = dt.datetime(2026, 5, 29, tzinfo=dt.timezone.utc)


def _track(**kw) -> Track:
    base = dict(id=1, title="仙泉", created_at=_NOW, updated_at=_NOW)
    base.update(kw)
    return Track(**base)


def _render(tmpl, track=None, *, prod="Averatec x Redketch", year=2026, publish_date="2026-05-30", genre_zh="中国风"):
    return render_template(tmpl, track or _track(), prod=prod, year=year, publish_date=publish_date, genre_zh=genre_zh)


def test_title_token():
    assert _render("{title}") == "仙泉"


def test_genre_token_uses_passed_zh():
    assert _render("{genre}", genre_zh="中国风") == "中国风"


def test_year_token():
    assert _render("{year} {title}", year=2027) == "2027 仙泉"


def test_prod_token():
    assert _render("Prod.{prod}") == "Prod.Averatec x Redketch"


def test_bpm_and_key_tokens():
    t = _track(bpm=140, key_signature="F# minor")
    assert _render("{bpm} {key}", t) == "140 F# minor"


def test_missing_value_renders_empty():
    assert _render("[{bpm}]", _track(bpm=None)) == "[]"
    assert _render("- {genre} -", genre_zh="") == "-  -"


def test_unknown_token_kept_verbatim():
    assert _render("{title} {foo}") == "仙泉 {foo}"


def test_literal_brace_text_not_crashing():
    assert _render("a { b {title}") == "a { b 仙泉"


def test_beat_name_default_template():
    # {free} renders empty when no free kwarg — the prefix is supplied by netease.render
    out = _render(DEFAULT_TEMPLATES["beat_name"])
    assert out == '"仙泉" - 中国风 TYPE BEAT'


def test_empty_template_renders_empty():
    assert _render("") == ""


def test_publish_date_token():
    assert _render("{publish date} Prod.{prod}", publish_date="2026-05-30") == "2026-05-30 Prod.Averatec x Redketch"


def test_spaced_token_trims_to_name():
    assert _render("{ title }") == "仙泉"


def test_existing_single_word_tokens_still_work():
    assert _render("{year}-{bpm}", _track(bpm=140)) == "2026-140"


def test_unknown_multiword_token_kept_verbatim():
    assert _render("{not a token}") == "{not a token}"


def test_album_description_default_template():
    out = _render(DEFAULT_TEMPLATES["album_description"], publish_date="2026-05-30")
    assert out == "2026-05-30 Prod.Averatec x Redketch"


def test_default_templates_have_all_keys():
    assert set(DEFAULT_TEMPLATES) == {
        "album_name", "beat_name", "beat_description", "album_description",
        "prod_separator", "free_prefix",
        "douyin_title", "douyin_caption", "douyin_topics",
    }


def test_free_token_renders_prefix_or_empty():
    import datetime as dt
    from beatos_core.export.templates import render_template
    from beatos_core.models.track import Track
    now = dt.datetime.now(dt.timezone.utc)
    t = Track(id=1, title="X", created_at=now, updated_at=now)
    out_free = render_template('{free}"{title}"', t, prod="", year=2026,
                               publish_date="", genre_zh="", free="[FREE] ")
    out_paid = render_template('{free}"{title}"', t, prod="", year=2026,
                               publish_date="", genre_zh="", free="")
    assert out_free == '[FREE] "X"'
    assert out_paid == '"X"'


def test_tags_token_joins_track_tags():
    t = _track(tags=["型beat", "说唱"])
    assert _render("{tags}", t) == "型beat 说唱"


def test_tags_token_empty_when_none():
    assert _render("[{tags}]", _track(tags=None)) == "[]"


def test_douyin_title_default_template():
    out = _render(DEFAULT_TEMPLATES["douyin_title"], genre_zh="Trap")
    assert out == "仙泉 Trap型beat"


def test_douyin_caption_default_template():
    t = _track(bpm=140, key_signature="F# minor")
    out = _render(DEFAULT_TEMPLATES["douyin_caption"], t, genre_zh="Trap")
    assert "仙泉" in out and "Trap" in out and "140BPM" in out and "F# minor" in out
