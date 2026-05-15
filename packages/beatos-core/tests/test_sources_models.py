import pytest
from beatos_core.sources.models import Source, SourceCreate, SourceUpdate


def test_source_create_strips_trailing_slash():
    sc = SourceCreate(name="Main", root_path="/Users/foo/Music/Beats/")
    assert sc.root_path == "/Users/foo/Music/Beats"


def test_source_create_requires_absolute_path():
    with pytest.raises(ValueError):
        SourceCreate(name="Main", root_path="./relative/path")


def test_source_create_name_defaults_to_basename():
    sc = SourceCreate(root_path="/Users/foo/Music/Beats")
    assert sc.name == "Beats"


def test_source_update_partial():
    su = SourceUpdate(name="Renamed")
    assert su.name == "Renamed"
    assert su.root_path is None
