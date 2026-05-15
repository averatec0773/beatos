"""FastAPI application factory."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from beatos_http.routes import assets, lists, sweep, tracks

_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def create_app() -> FastAPI:
    app = FastAPI(title="BeatOS HTTP", version="0.0.4")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_ALLOWED_ORIGINS,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(tracks.router)
    app.include_router(assets.router)
    app.include_router(lists.router)
    app.include_router(sweep.router)

    return app
