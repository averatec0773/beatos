from beatos_core.tracks.query_parser import parse_query, FilterSpec


def test_empty_string_is_empty_spec():
    assert parse_query("") == FilterSpec()
    assert parse_query("   ") == FilterSpec()


def test_bare_words_become_text_terms():
    assert parse_query("dark moody") == FilterSpec(text=["dark", "moody"])


def test_field_tokens_map_to_lists():
    spec = parse_query("genre:trap producer:smoke mood:dark key:Fm tag:loud")
    assert spec.genres == ["trap"]
    assert spec.producers == ["smoke"]
    assert spec.moods == ["dark"]
    assert spec.keys == ["Fm"]
    assert spec.tags == ["loud"]


def test_repeated_field_accumulates_or():
    assert parse_query("genre:trap genre:drill").genres == ["trap", "drill"]


def test_bpm_operators():
    assert parse_query("bpm:>140") == FilterSpec(bpm_min=141)
    assert parse_query("bpm:<160") == FilterSpec(bpm_max=159)
    assert parse_query("bpm:140-160") == FilterSpec(bpm_min=140, bpm_max=160)
    assert parse_query("bpm:140") == FilterSpec(bpm_min=140, bpm_max=140)
    assert parse_query("bpm:>=140") == FilterSpec(bpm_min=140)
    assert parse_query("bpm:<=160") == FilterSpec(bpm_max=160)


def test_has_audio():
    assert parse_query("has:audio") == FilterSpec(has_audio=True)


def test_quoted_value_allows_spaces():
    assert parse_query('producer:"young chop"').producers == ["young chop"]


def test_unknown_field_falls_back_to_text():
    assert parse_query("foo:bar").text == ["foo:bar"]


def test_case_insensitive_field_keys_value_preserved():
    spec = parse_query("GENRE:Trap")
    assert spec.genres == ["Trap"]


def test_mixed_query():
    spec = parse_query('genre:trap bpm:>140 producer:"young chop" dark')
    assert spec.genres == ["trap"]
    assert spec.bpm_min == 141
    assert spec.producers == ["young chop"]
    assert spec.text == ["dark"]


def test_inverted_bpm_range_falls_back_to_text():
    assert parse_query("bpm:200-100").text == ["bpm:200-100"]
    assert parse_query("bpm:200-100").bpm_min is None


def test_bpm_empty_value_falls_back_to_text():
    assert parse_query("bpm:").text == ["bpm:"]


def test_has_non_audio_falls_back_to_text():
    assert parse_query("has:video").text == ["has:video"]
    assert parse_query("has:video").has_audio is None
