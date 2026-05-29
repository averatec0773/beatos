from beatos_platforms import load_vocab_map
from beatos_platforms import load_form_map


def test_load_existing_map_returns_dict():
    m = load_vocab_map("netease", "genre")
    assert isinstance(m, dict)


def test_unknown_platform_returns_empty():
    assert load_vocab_map("does-not-exist", "genre") == {}


def test_load_form_map_netease():
    fm = load_form_map("netease")
    assert isinstance(fm, dict)
    assert "fields" in fm and "match" in fm
    # 字段 key 必须与 ExportResult 的 key 对齐
    assert "title" in fm["fields"]
    assert fm["fields"]["title"]["type"] == "text"


def test_load_form_map_unknown_platform_empty():
    assert load_form_map("myspace") == {}
