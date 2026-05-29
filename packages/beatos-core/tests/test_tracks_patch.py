from beatos_core.tracks.patch import apply_array_patch, FIELD_TO_COL, SCALAR_FIELDS


def test_replace_dedupes_preserving_order():
    assert apply_array_patch('["a","b"]', ["b", "b", "c"]) == ["b", "c"]


def test_add_appends_without_dupes():
    assert apply_array_patch('["a"]', {"add": ["a", "b"]}) == ["a", "b"]


def test_remove_drops_values():
    assert apply_array_patch('["a","b","c"]', {"remove": ["b"]}) == ["a", "c"]


def test_add_and_remove_remove_runs_first():
    assert apply_array_patch('["a","b"]', {"add": ["b"], "remove": ["b"]}) == ["a", "b"]


def test_field_maps_present():
    assert FIELD_TO_COL["key"] == "key_signature"
    assert "bpm" in SCALAR_FIELDS
