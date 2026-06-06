"""The sidecar serves the built web SPA at / when BEATOS_WEB_DIR is set, while
/api/* keeps precedence."""
from fastapi.testclient import TestClient

from beatos_http.app import create_app


def test_root_serves_index_when_web_dir_set(tmp_path, monkeypatch):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<!doctype html><title>BeatOS Web</title>")
    monkeypatch.setenv("BEATOS_WEB_DIR", str(web))

    client = TestClient(create_app())
    res = client.get("/")

    assert res.status_code == 200
    assert "BeatOS Web" in res.text


def test_api_takes_precedence_over_static(tmp_path, monkeypatch):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<!doctype html><title>BeatOS Web</title>")
    monkeypatch.setenv("BEATOS_WEB_DIR", str(web))

    client = TestClient(create_app())
    res = client.get("/api/health")

    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_no_static_mount_when_web_dir_unset(monkeypatch):
    monkeypatch.delenv("BEATOS_WEB_DIR", raising=False)

    client = TestClient(create_app())
    res = client.get("/")

    assert res.status_code == 404


def test_no_static_mount_when_web_dir_missing(tmp_path, monkeypatch):
    """A configured-but-nonexistent dir must not raise at mount time (the
    is_dir() guard skips the mount)."""
    monkeypatch.setenv("BEATOS_WEB_DIR", str(tmp_path / "does-not-exist"))

    client = TestClient(create_app())
    res = client.get("/")

    assert res.status_code == 404
