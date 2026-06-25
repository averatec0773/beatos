"""First-launch demo seed.

Seeds a small catalog of fully-populated template tracks into a brand-new, empty
library so a fresh install isn't blank. Three beats of distinct styles
(cinematic, Chinese hip hop, melodic rap), each with a cover, a tagged-MP3
preview, the standard multi-currency pricing tiers, and a free non-commercial
download. Runs once on sidecar startup (after migrations) and is:

- **idempotent** — a `demo_seeded` app-setting flag means it never seeds twice;
- **non-intrusive** — a library that already holds tracks (an existing user
  upgrading) is left untouched, and the flag is still set so the demo never
  appears later (e.g. if they empty the library);
- **best-effort** — every failure is logged, never raised into startup.

`is_free=True` on every template is deliberate and does NOT mean "free instead
of paid": a free non-commercial download coexists with the paid license tiers
(see CLAUDE.md "is_free and paid tiers coexist").

Assets are bundled with the package and copied into a stable user-data dir
(`<db parent>/demo/`) so the *linked* asset paths survive app updates.
"""
from __future__ import annotations

import logging
import os
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

# Standard pricing, mirrored from the real catalog (CNY). Every template also
# sets is_free=True, so a free non-commercial download coexists with these paid
# tiers — the two are NOT mutually exclusive (see module docstring / CLAUDE.md).
_TIERS = (
    {"name": "MP3", "deliverables": ["mp3"], "prices": {"CNY": 128.0}},
    {"name": "WAV", "deliverables": ["wav"], "prices": {"CNY": 188.0}},
    {"name": "STEM", "deliverables": ["stem"], "prices": {"CNY": 288.0}},
)

# Three template beats of distinct styles, surfaced on first launch with the
# generic titles "template1/2/3" so a new user immediately reads them as
# editable examples to replace. The underlying beat (kept in the trailing
# comment for maintainers) supplies the real cover/audio/metadata; each
# `description` carries that beat's NetEase reference link, mapped by SONG
# IDENTITY (verified), not by the order the links were supplied.
#
# All values are data (i18n-exempt) and fully editable in-app. Genre/mood are
# canonical vocab tokens (netease maps); key uses the "<note> <mode>" form
# parse-key expects. The producer casing of the first writer wins
# (canonicalize-on-write), so "Averatec" leads everywhere.
_DEMO_TRACKS = (
    # Template 1 — REGALIA: cinematic / epic orchestral ("FINAL" REGALIA type beat).
    {
        "title": "template1",
        "audio": "regalia.mp3",
        "cover": "regalia-cover.jpg",
        "meta": {
            "bpm": 127,
            "key_signature": "D minor",
            "genre": ["Regalia"],
            "mood": ["Epic", "Grand", "Dark"],
            "producer": ["Averatec"],
            "is_free": True,
            "description": "https://music.163.com/#/song?id=2155196363",
        },
    },
    # Template 2 — 寒江雪 (Cold River Snow): Chinese hip hop / china type beat.
    {
        "title": "template2",
        "audio": "hanjiangxue.mp3",
        "cover": "hanjiangxue-cover.jpg",
        "meta": {
            "bpm": 137,
            "key_signature": "F# minor",
            "genre": ["Chinese Hip Hop"],
            "mood": ["Sacred", "Psychedelic"],
            "producer": ["yusician", "Averatec"],
            "is_free": True,
            "description": "https://music.163.com/#/song?id=3374182565",
        },
    },
    # Template 3 — 契约 (Covenant): melodic rap / melodic type beat.
    {
        "title": "template3",
        "audio": "qiyue.mp3",
        "cover": "qiyue-cover.jpg",
        "meta": {
            "bpm": 152,
            "key_signature": "F minor",
            "genre": ["Melodic Rap"],
            "mood": ["Elegant", "Sacred", "Epic"],
            "producer": ["4Harry", "Averatec"],
            "is_free": True,
            "description": "https://music.163.com/#/song?id=3391062994",
        },
    },
)


async def _track_count() -> int:
    """Total rows in `track` (including trashed) — the proxy for "has this user
    ever used the app". A user who added then trashed every track is NOT empty
    and must not get a demo injected."""
    async with aiosqlite.connect(resolve_db_path()) as conn:
        async with conn.execute("SELECT COUNT(*) FROM track") as cur:
            row = await cur.fetchone()
    return int(row[0]) if row else 0


async def seed_demo_if_needed(*, source_dir: pathlib.Path | None = None) -> bool:
    """Seed the demo tracks on a brand-new install. Returns True iff at least one
    track was actually seeded. Safe to call on every startup."""
    try:
        # Kill-switch for tests/CI so a brand-new DB stays empty and row counts
        # are deterministic (mirrors BEATOS_DISABLE_FS_API / BEATOS_MCP_DISABLE_AUTH).
        # Skips without setting the flag, so it never affects a real run.
        if os.environ.get("BEATOS_DISABLE_DEMO_SEED") == "1":
            return False
        if await get_setting(_SEEDED_KEY):
            return False  # already seeded or deliberately skipped

        # Existing user upgrading: leave their library alone, but mark handled
        # so the demo never appears later.
        if await _track_count() > 0:
            await set_setting(_SEEDED_KEY, True)
            return False

        src = source_dir or _BUNDLED_DIR
        # Verify every bundled file is present before touching the DB — a missing
        # file is a build problem, so bail without setting the flag (retry later).
        missing = [
            src / name
            for spec in _DEMO_TRACKS
            for name in (spec["audio"], spec["cover"])
            if not (src / name).exists()
        ]
        if missing:
            log.warning("demo seed skipped: bundled assets missing: %s", missing)
            return False

        # Copy into a stable user-data dir so the linked asset paths survive app
        # updates (the bundle location may move or be read-only).
        demo_dir = resolve_db_path().parent / "demo"
        demo_dir.mkdir(parents=True, exist_ok=True)

        seeded_any = False
        for spec in _DEMO_TRACKS:
            audio_dst = demo_dir / spec["audio"]
            cover_dst = demo_dir / spec["cover"]
            shutil.copy2(src / spec["audio"], audio_dst)
            shutil.copy2(src / spec["cover"], cover_dst)

            track = await create_track(spec["title"])
            await update_track(track.id, dict(spec["meta"]))
            await attach_asset(track.id, "audio_tagged", audio_dst)
            await attach_asset(track.id, "cover", cover_dst)
            for tier in _TIERS:
                await create_tier(
                    track.id,
                    name=tier["name"],
                    deliverables=list(tier["deliverables"]),
                    prices=dict(tier["prices"]),
                )
            log.info("demo seed: created track id=%s (%s)", track.id, spec["title"])
            seeded_any = True

        await set_setting(_SEEDED_KEY, True)
        return seeded_any
    except Exception:
        log.exception("demo seed failed; will retry next startup")
        return False
