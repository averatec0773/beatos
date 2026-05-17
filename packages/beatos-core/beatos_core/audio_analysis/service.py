import datetime as _dt
import pathlib

import aiosqlite

from beatos_core.assets.service import get_asset
from beatos_core.db import resolve_db_path

from .models import AudioAnalysisResult
from .pipeline import analyze

AUDIO_ROLES = frozenset({
    "audio_tagged_mp3",
    "audio_untagged_mp3",
    "audio_tagged_wav",
    "audio_untagged_wav",
})


async def analyze_asset(asset_id: int) -> AudioAnalysisResult:
    asset = await get_asset(asset_id)
    if asset is None:
        raise FileNotFoundError(f"Asset {asset_id} not found")
    if asset.role not in AUDIO_ROLES:
        raise ValueError(f"Asset role {asset.role} is not audio")
    p = pathlib.Path(asset.abs_path)
    if not p.exists():
        raise FileNotFoundError(f"Audio file missing: {asset.abs_path}")

    sha = asset.sha256 or ""
    db_path = resolve_db_path()

    async with aiosqlite.connect(db_path) as conn:
        async with conn.execute(
            "SELECT bpm, bpm_confidence, key_signature, key_confidence, duration_seconds, analyzed_at "
            "FROM analysis_cache WHERE asset_id = ? AND sha256 = ?",
            (asset_id, sha),
        ) as cur:
            row = await cur.fetchone()
        if row:
            return AudioAnalysisResult(
                asset_id=asset_id,
                sha256=sha,
                bpm=row[0],
                bpm_confidence=row[1],
                key=row[2],
                key_confidence=row[3],
                duration_seconds=row[4],
                analyzed_at=_dt.datetime.fromisoformat(row[5]),
            )

    raw = analyze(asset.abs_path)
    now = _dt.datetime.now(_dt.timezone.utc)

    async with aiosqlite.connect(db_path) as conn:
        await conn.execute(
            "INSERT OR REPLACE INTO analysis_cache "
            "(asset_id, sha256, bpm, bpm_confidence, key_signature, key_confidence, duration_seconds, analyzed_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (asset_id, sha, raw.bpm, raw.bpm_confidence, raw.key, raw.key_confidence,
             raw.duration_seconds, now.isoformat()),
        )
        await conn.commit()

    return AudioAnalysisResult(
        asset_id=asset_id,
        sha256=sha,
        bpm=raw.bpm,
        bpm_confidence=raw.bpm_confidence,
        key=raw.key,
        key_confidence=raw.key_confidence,
        duration_seconds=raw.duration_seconds,
        analyzed_at=now,
    )
