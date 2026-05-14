"""FastAPI application factory."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

_ALLOWED_ORIGINS = [
    "http://localhost:5173",  # electron-vite dev renderer
    "http://127.0.0.1:5173",
    # Electron production renderer uses file:// — tighten in v0.0.2.
]


def create_app() -> FastAPI:
    app = FastAPI(title="BeatOS HTTP", version="0.0.1")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_ALLOWED_ORIGINS,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
