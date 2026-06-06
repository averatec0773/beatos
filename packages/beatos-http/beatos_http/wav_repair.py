"""Server-side WAV sanitization (ported from apps/desktop/src/main/asset-protocol.ts).

Some DAWs emit WAVs with a JUNK chunk before `fmt ` (Pro Tools sector-align
padding) and/or cue/LIST/smpl chunks after `data` (markers, loop points).
Chromium's `decodeAudioData` has historically been picky about extra RIFF
chunks. We keep `fmt ` + `data` verbatim and drop the rest, and unwrap
WAVE_FORMAT_EXTENSIBLE (0xFFFE) to a plain PCM(1)/FLOAT(3) code.

FLOAT-32 / 24-bit PCM are NOT transcoded — decodeAudioData handles them
natively, and the fmt block is preserved as-is.

`repair_wav_if_needed` returns the input object unchanged when it is already a
canonical { fmt, data } RIFF (zero-copy fast path). `wav_needs_repair` walks
chunk headers by seeking (without reading the large data body) so a clean WAV
can stay on a range-capable FileResponse.
"""
from __future__ import annotations

import struct
from typing import BinaryIO


def wav_needs_repair(f: BinaryIO) -> bool:
    """Cheap header-only scan: True if the WAV has anything beyond a canonical
    { fmt, data } pair, or uses WAVE_FORMAT_EXTENSIBLE. Seeks past chunk bodies
    rather than reading them, so it does not pull the audio data into memory.
    Leaves the stream position undefined (caller should re-open / seek)."""
    head = f.read(12)
    if len(head) < 12 or head[0:4] != b"RIFF" or head[8:12] != b"WAVE":
        return False
    seen: list[bytes] = []
    is_ext = False
    while True:
        hdr = f.read(8)
        if len(hdr) < 8:
            break
        cid = hdr[0:4]
        size = struct.unpack("<I", hdr[4:8])[0]
        seen.append(cid)
        if cid == b"fmt ":
            fmt = f.read(min(size, 26))
            if len(fmt) >= 2 and struct.unpack_from("<H", fmt, 0)[0] == 0xFFFE:
                is_ext = True
            f.seek((size - len(fmt)) + (size & 1), 1)
        else:
            f.seek(size + (size & 1), 1)
    clean = (
        len(seen) == 2 and seen[0] == b"fmt " and seen[1] == b"data" and not is_ext
    )
    return not clean


def repair_wav_if_needed(buf: bytes) -> bytes:
    """Return a sanitized copy when `buf` is a WAV with extra chunks / EXTENSIBLE
    fmt; otherwise return `buf` unchanged (identity, zero-copy)."""
    if len(buf) < 12:
        return buf
    if buf[0:4] != b"RIFF" or buf[8:12] != b"WAVE":
        return buf

    n = len(buf)
    pos = 12
    fmt_start = fmt_len = -1
    data_start = data_len = -1
    extra = 0
    seen: list[bytes] = []
    while pos + 8 <= n:
        cid = buf[pos:pos + 4]
        size = struct.unpack_from("<I", buf, pos + 4)[0]
        body = pos + 8
        safe = min(size, n - body)
        if safe < 0:
            break
        seen.append(cid)
        if cid == b"fmt ":
            fmt_start, fmt_len = body, safe
        elif cid == b"data":
            data_start, data_len = body, safe
        else:
            extra += 1
        pos = body + safe + (safe & 1)

    if fmt_start < 0 or data_start < 0 or fmt_len <= 0 or data_len <= 0:
        return buf

    raw_fmt = struct.unpack_from("<H", buf, fmt_start)[0] if fmt_len >= 2 else 1
    is_ext = raw_fmt == 0xFFFE
    unwrapped = raw_fmt
    if is_ext and fmt_len >= 26:
        sub = struct.unpack_from("<H", buf, fmt_start + 24)[0]
        if sub in (1, 3):
            unwrapped = sub

    if (
        extra == 0
        and len(seen) == 2
        and seen[0] == b"fmt "
        and seen[1] == b"data"
        and not is_ext
    ):
        return buf

    fmt_pad = fmt_len & 1
    out_size = 12 + 8 + fmt_len + fmt_pad + 8 + data_len
    out = bytearray(out_size)
    out[0:4] = b"RIFF"
    struct.pack_into("<I", out, 4, out_size - 8)
    out[8:12] = b"WAVE"
    out[12:16] = b"fmt "
    struct.pack_into("<I", out, 16, fmt_len)
    out[20:20 + fmt_len] = buf[fmt_start:fmt_start + fmt_len]
    if is_ext and unwrapped != raw_fmt:
        struct.pack_into("<H", out, 20, unwrapped)
    # fmt pad byte (out[20+fmt_len]) is already 0 from bytearray init.
    data_chunk = 20 + fmt_len + fmt_pad
    out[data_chunk:data_chunk + 4] = b"data"
    struct.pack_into("<I", out, data_chunk + 4, data_len)
    out[data_chunk + 8:data_chunk + 8 + data_len] = buf[data_start:data_start + data_len]
    return bytes(out)
