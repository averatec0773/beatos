"""Tests for one-shot scan of a folder."""
import pathlib
import wave

import pytest

from beatos_core.watcher.scanner import scan_folder


def _make_wav(path: pathlib.Path) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes(b"\x00\x00" * 44100)


@pytest.mark.asyncio
async def test_scan_returns_audio_files(tmp_path):
    folder = tmp_path / "exports"
    folder.mkdir()
    _make_wav(folder / "beat_01.wav")
    _make_wav(folder / "beat_02.wav")
    (folder / "readme.txt").write_text("not audio")

    result = await scan_folder(folder)

    paths = sorted(f["path"] for f in result)
    assert paths == [
        str((folder / "beat_01.wav").resolve()),
        str((folder / "beat_02.wav").resolve()),
    ]


@pytest.mark.asyncio
async def test_scan_returns_sha256_per_file(tmp_path):
    folder = tmp_path / "exports"
    folder.mkdir()
    _make_wav(folder / "beat.wav")

    result = await scan_folder(folder)

    assert len(result) == 1
    assert len(result[0]["sha256"]) == 64


@pytest.mark.asyncio
async def test_scan_recurses_into_subdirs(tmp_path):
    folder = tmp_path / "exports"
    sub = folder / "drafts"
    sub.mkdir(parents=True)
    _make_wav(folder / "a.wav")
    _make_wav(sub / "b.wav")

    result = await scan_folder(folder)

    assert len(result) == 2
