"""Unit tests for the server-side WAV sanitizer (ported from asset-protocol.ts)."""
import io
import struct

import pytest

from beatos_http.wav_repair import (
    repair_wav_if_needed,
    repair_wav_to_file,
    wav_needs_repair,
)


def _chunk(cid: bytes, body: bytes) -> bytes:
    pad = b"\x00" if (len(body) & 1) else b""
    return cid + struct.pack("<I", len(body)) + body + pad


def _fmt_pcm() -> bytes:
    # 16-byte PCM fmt: format=1, ch=1, rate=44100, byterate, blockalign, bits=16
    return struct.pack("<HHIIHH", 1, 1, 44100, 44100 * 2, 2, 16)


def _riff(*chunks: bytes) -> bytes:
    body = b"WAVE" + b"".join(chunks)
    return b"RIFF" + struct.pack("<I", len(body)) + body


def _needs_repair(buf: bytes) -> bool:
    """Run wav_needs_repair over an in-memory buffer (no filesystem)."""
    return wav_needs_repair(io.BytesIO(buf))


def test_clean_wav_is_returned_unchanged_identity():
    data = _chunk(b"data", b"\x01\x02\x03\x04")
    clean = _riff(_chunk(b"fmt ", _fmt_pcm()), data)
    out = repair_wav_if_needed(clean)
    assert out is clean  # zero-copy fast path
    assert _needs_repair(clean) is False


def test_non_wav_passthrough():
    blob = b"ID3\x04stuff and things"
    assert repair_wav_if_needed(blob) is blob


def test_junk_and_trailing_chunks_are_stripped_but_audio_preserved():
    audio = b"\xaa\xbb\xcc\xdd\xee\xff\x11\x22"
    dirty = _riff(
        _chunk(b"JUNK", b"\x00" * 12),
        _chunk(b"fmt ", _fmt_pcm()),
        _chunk(b"data", audio),
        _chunk(b"cue ", b"\x00" * 4),
    )
    out = repair_wav_if_needed(dirty)
    assert out is not dirty
    assert out[0:4] == b"RIFF" and out[8:12] == b"WAVE"
    # RIFF size field is the canonical out_size - 8.
    assert struct.unpack_from("<I", out, 4)[0] == len(out) - 8
    # Only fmt + data survive.
    assert out[12:16] == b"fmt "
    fmt_len = struct.unpack_from("<I", out, 16)[0]
    data_off = 20 + fmt_len + (fmt_len & 1)
    assert out[data_off:data_off + 4] == b"data"
    data_len = struct.unpack_from("<I", out, data_off + 4)[0]
    assert out[data_off + 8:data_off + 8 + data_len] == audio


def test_repair_is_idempotent():
    # Repairing an already-repaired WAV must be a no-op (identity) — this is what
    # keeps the Electron client-side re-repair from corrupting server-repaired bytes.
    audio = b"\xde\xad\xbe\xef" * 16
    dirty = _riff(
        _chunk(b"JUNK", b"\x00" * 8),
        _chunk(b"fmt ", _fmt_pcm()),
        _chunk(b"data", audio),
        _chunk(b"LIST", b"INFOdata"),
    )
    once = repair_wav_if_needed(dirty)
    twice = repair_wav_if_needed(once)
    assert twice is once  # canonical {fmt,data} hits the zero-copy fast path
    assert _needs_repair(once) is False


def test_extensible_format_is_unwrapped_to_pcm():
    # 40-byte EXTENSIBLE fmt: tag=0xFFFE, ... SubFormat GUID first 2 bytes = 1 (PCM)
    ext = struct.pack("<HHIIHH", 0xFFFE, 1, 44100, 44100 * 2, 2, 16)
    ext += struct.pack("<H", 22)  # cbSize
    ext += struct.pack("<H", 16)  # valid bits
    ext += struct.pack("<I", 0x3)  # channel mask
    ext += struct.pack("<H", 1) + b"\x00" * 14  # SubFormat GUID (first 2 bytes = PCM)
    audio = b"\x10\x20\x30\x40"
    dirty = _riff(_chunk(b"fmt ", ext), _chunk(b"data", audio))
    out = repair_wav_if_needed(dirty)
    assert out is not dirty

    # Only the format code (bytes 0-1 of fmt) is rewritten; the rest of the fmt
    # body is preserved verbatim, the audio data is byte-identical, and the RIFF
    # size field is self-consistent.
    fmt_len = struct.unpack_from("<I", out, 16)[0]
    assert fmt_len == len(ext)
    assert struct.unpack_from("<H", out, 20)[0] == 1  # exposed as plain PCM
    assert out[22:20 + fmt_len] == ext[2:]  # remainder of fmt unchanged
    data_off = 20 + fmt_len + (fmt_len & 1)
    assert out[data_off:data_off + 4] == b"data"
    data_len = struct.unpack_from("<I", out, data_off + 4)[0]
    assert out[data_off + 8:data_off + 8 + data_len] == audio
    assert struct.unpack_from("<I", out, 4)[0] == len(out) - 8


def test_repair_wav_to_file_matches_in_memory(tmp_path):
    """The streaming file-to-file repair produces the same canonical bytes as the
    in-memory repair, without buffering the whole file."""
    audio = b"\x11\x22\x33\x44" * 256
    dirty = _riff(
        _chunk(b"JUNK", b"\x00" * 12),
        _chunk(b"fmt ", _fmt_pcm()),
        _chunk(b"data", audio),
        _chunk(b"cue ", b"\x00" * 4),
    )
    src = tmp_path / "dirty.wav"
    src.write_bytes(dirty)
    dst = tmp_path / "clean.wav"

    repair_wav_to_file(src, dst)

    out = dst.read_bytes()
    assert out == repair_wav_if_needed(dirty)
    assert wav_needs_repair(io.BytesIO(out)) is False


def test_repair_wav_to_file_handles_odd_data_length(tmp_path):
    """An odd-length data chunk gets its trailing pad byte written back."""
    audio = b"\xaa\xbb\xcc"  # 3 bytes -> odd, needs a pad byte
    dirty = _riff(
        _chunk(b"JUNK", b"\x00" * 4),
        _chunk(b"fmt ", _fmt_pcm()),
        _chunk(b"data", audio),
    )
    src = tmp_path / "odd.wav"
    src.write_bytes(dirty)
    dst = tmp_path / "odd-clean.wav"

    repair_wav_to_file(src, dst)

    out = dst.read_bytes()
    assert out == repair_wav_if_needed(dirty)
    data_off = out.index(b"data")
    data_len = struct.unpack_from("<I", out, data_off + 4)[0]
    assert data_len == 3
    assert out[data_off + 8:data_off + 8 + 3] == audio
    # data is the last chunk, so no trailing pad byte is emitted (matches the
    # in-memory repair's out_size).
    assert len(out) == data_off + 8 + 3


def test_repair_wav_to_file_rejects_non_wav(tmp_path):
    src = tmp_path / "notwav.bin"
    src.write_bytes(b"ID3\x04not a wav at all")
    dst = tmp_path / "out.wav"
    with pytest.raises(ValueError):
        repair_wav_to_file(src, dst)
