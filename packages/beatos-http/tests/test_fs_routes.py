"""Tests for the local filesystem browse + download endpoints (web frontend)."""
import pathlib

from fastapi.testclient import TestClient

from beatos_http.app import create_app


def _client() -> TestClient:
    return TestClient(create_app())


def test_fs_list_dirs_first_hides_dotfiles(tmp_path: pathlib.Path):
    (tmp_path / "b_dir").mkdir()
    (tmp_path / "a_file.wav").write_bytes(b"\x00\x01")
    (tmp_path / ".hidden").write_text("x")

    res = _client().get("/api/fs/list", params={"path": str(tmp_path)})

    assert res.status_code == 200
    body = res.json()
    assert body["cwd"] == str(tmp_path.resolve())
    assert body["parent"] == str(tmp_path.resolve().parent)
    names = [e["name"] for e in body["entries"]]
    assert ".hidden" not in names
    assert names == ["b_dir", "a_file.wav"]
    file_entry = next(e for e in body["entries"] if e["name"] == "a_file.wav")
    assert file_entry["is_dir"] is False
    assert file_entry["ext"] == "wav"
    assert file_entry["size"] == 2


def test_fs_list_defaults_to_home(monkeypatch, tmp_path):
    monkeypatch.setattr(pathlib.Path, "home", classmethod(lambda cls: tmp_path))
    (tmp_path / "x").mkdir()

    res = _client().get("/api/fs/list")

    assert res.status_code == 200
    assert res.json()["cwd"] == str(tmp_path.resolve())


def test_fs_list_404_for_missing_or_nondir(tmp_path):
    f = tmp_path / "f.txt"
    f.write_text("x")
    client = _client()
    assert client.get("/api/fs/list", params={"path": str(tmp_path / "nope")}).status_code == 404
    assert client.get("/api/fs/list", params={"path": str(f)}).status_code == 404


def test_fs_download_sets_attachment(tmp_path):
    f = tmp_path / "beat.wav"
    f.write_bytes(b"RIFFWAVE-ish")

    res = _client().get("/api/fs/download", params={"path": str(f)})

    assert res.status_code == 200
    assert "attachment" in res.headers.get("content-disposition", "")
    assert "beat.wav" in res.headers.get("content-disposition", "")
    assert res.content == b"RIFFWAVE-ish"


def test_fs_download_404_for_missing(tmp_path):
    assert _client().get("/api/fs/download", params={"path": str(tmp_path / "no.wav")}).status_code == 404
