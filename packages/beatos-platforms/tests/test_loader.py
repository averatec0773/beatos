from beatos_platforms import load_vocab_map


def test_load_existing_map_returns_dict():
    m = load_vocab_map("netease", "genre")
    assert isinstance(m, dict)


def test_unknown_platform_returns_empty():
    assert load_vocab_map("does-not-exist", "genre") == {}


def test_beatstars_vocab_maps_load():
    from beatos_platforms import load_vocab_map
    g = load_vocab_map("beatstars", "genre")
    m = load_vocab_map("beatstars", "mood")
    assert g.get("Trap Rap") == "Trap"
    assert m.get("Dark") == "Dark"
