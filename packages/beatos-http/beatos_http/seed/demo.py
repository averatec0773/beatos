"""First-launch demo seed.

Seeds one fully-populated demo track ("REGALIA") into a brand-new, empty
library so a fresh install isn't blank. Runs once on sidecar startup (after
migrations) and is:

- **idempotent** — a `demo_seeded` app-setting flag means it never seeds twice;
- **non-intrusive** — a library that already holds tracks (an existing user
  upgrading) is left untouched, and the flag is still set so the demo never
  appears later (e.g. if they empty the library);
- **best-effort** — every failure is logged, never raised into startup.

Assets are bundled with the package and copied into a stable user-data dir
(`<db parent>/demo/`) so the *linked* asset paths survive app updates.
"""
from __future__ import annotations

import logging
import pathlib
import shutil

import aiosqlite

from beatos_core.app_settings.service import get_setting, set_setting
from beatos_core.assets.service import attach_asset
from beatos_core.db import resolve_db_path
from beatos_core.licenses.service import create_tier
from beatos_core.tracks.service import create_track, update_track

log = logging.getLogger(__name__)

_SEEDED_KEY = "demo_seeded"
_BUNDLED_DIR = pathlib.Path(__file__).parent / "assets"
_AUDIO_FILE = "regalia.mp3"
_COVER_FILE = "regalia-cover.jpg"

# Demo track data. "Regalia" is a real genre token and the moods are canonical
# vocab values (packages/beatos-platforms netease maps); key uses the
# "<note> <mode>" form parse-key expects. These are data values (exempt from
# i18n) — the producer can edit them in-app.
_DEMO_TITLE = "REGALIA"
_DEMO_META = {
    "bpm": 127,
    "key_signature": "D minor",
    "genre": ["Regalia"],
    "mood": ["Epic", "Grand", "Dark"],
    "producer": ["Averatec"],
    "is_free": True,
}
_DEMO_PRICE = {"CNY": 128.0}


async def _track_count() -> int:
    """Total rows in `track` (including trashed) — the proxy for "has this user
    ever used the app". A user who added then trashed every track is NOT empty
    and must not get a demo injected."""
    async with aiosqlite.connect(resolve_db_path()) as conn:
        async with conn.execute("SELECT COUNT(*) FROM track") as cur:
            row = await cur.fetchone()
    return int(row[0]) if row else 0


async def seed_demo_if_needed(*, source_dir: pathlib.Path | None = None) -> bool:
    """Seed the demo track on a brand-new install. Returns True iff a track was
    actually seeded. Safe to call on every startup."""
    try:
        if await get_setting(_SEEDED_KEY):
            return False  # already seeded or deliberately skipped

        # Existing user upgrading: leave their library alone, but mark handled
        # so the demo never appears later.
        if await _track_count() > 0:
            await set_setting(_SEEDED_KEY, True)
            return False

        src = source_dir or _BUNDLED_DIR
        audio_src = src / _AUDIO_FILE
        cover_src = src / _COVER_FILE
        if not audio_src.exists() or not cover_src.exists():
            log.warning("demo seed skipped: bundled assets missing in %s", src)
            return False

        # Copy into a stable user-data dir so the linked asset paths survive app
        # updates (the bundle location may move or be read-only).
        demo_dir = resolve_db_path().parent / "demo"
        demo_dir.mkdir(parents=True, exist_ok=True)
        audio_dst = demo_dir / _AUDIO_FILE
        cover_dst = demo_dir / _COVER_FILE
        shutil.copy2(audio_src, audio_dst)
        shutil.copy2(cover_src, cover_dst)

        track = await create_track(_DEMO_TITLE)
        await update_track(track.id, dict(_DEMO_META))
        await attach_asset(track.id, "audio_tagged_mp3", audio_dst)
        await attach_asset(track.id, "cover", cover_dst)
        await create_tier(
            track.id, name="MP3", deliverables=["mp3"], prices=dict(_DEMO_PRICE)
        )

        await set_setting(_SEEDED_KEY, True)
        log.info("demo seed: created track id=%s (%s)", track.id, _DEMO_TITLE)
        return True
    except Exception:
        log.exception("demo seed failed; will retry next startup")
        return False
