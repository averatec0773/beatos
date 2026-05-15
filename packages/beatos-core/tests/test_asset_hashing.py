"""Tests for sha256 hashing of asset files."""
import hashlib

import pytest

from beatos_core.assets.hashing import sha256_file


@pytest.mark.asyncio
async def test_sha256_matches_hashlib(tmp_path):
    """Our async chunked hash matches the canonical hashlib result."""
    file = tmp_path / "sample.bin"
    payload = b"BeatOS test payload" * 1000  # ~19KB
    file.write_bytes(payload)

    expected = hashlib.sha256(payload).hexdigest()
    actual = await sha256_file(file)

    assert actual == expected


@pytest.mark.asyncio
async def test_sha256_handles_large_file(tmp_path):
    """A multi-MB file hashes correctly without truncating."""
    file = tmp_path / "big.bin"
    chunk = b"\x42" * 65536  # 64KB
    with file.open("wb") as f:
        for _ in range(128):  # 8MB total
            f.write(chunk)

    expected = hashlib.sha256(chunk * 128).hexdigest()
    actual = await sha256_file(file)

    assert actual == expected
