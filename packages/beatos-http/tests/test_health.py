"""Tests for /api/health."""
from fastapi.testclient import TestClient

from beatos_http.app import create_app


def test_health_returns_ok():
    app = create_app()
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_allows_localhost_5173():
    """Renderer dev origin must be allowed (electron-vite default port)."""
    app = create_app()
    client = TestClient(app)

    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
