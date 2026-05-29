import { describe, it, expect, vi } from "vitest";
import { handleAssetRequest, repairWavIfNeeded, type FetchLike } from "../asset-protocol";

function mockFetch(handler: (url: string, init?: RequestInit) => Response): FetchLike {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
}

/** Minimal valid WAV: RIFF + fmt + data, 8-bit mono 8kHz silence */
function buildMinimalWav(dataBytes = 64): ArrayBuffer {
  const data = new Uint8Array(dataBytes).fill(0x80);
  const buf = new ArrayBuffer(44 + dataBytes);
  const u8 = new Uint8Array(buf);
  const v = new DataView(buf);
  u8.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  v.setUint32(4, 36 + dataBytes, true);
  u8.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  u8.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 1 channel
  v.setUint32(24, 8000, true); // sample rate
  v.setUint32(28, 8000, true); // byte rate
  v.setUint16(32, 1, true); // block align
  v.setUint16(34, 8, true); // bits per sample
  u8.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  v.setUint32(40, dataBytes, true);
  u8.set(data, 44);
  return buf;
}

/** Wrap a clean WAV with a 28-byte JUNK chunk before fmt and 100 bytes
 * of trailing junk after data (cue/list/smpl chunk simulation). */
function buildDawWav(): { input: ArrayBuffer; expectedDataBytes: number } {
  const clean = buildMinimalWav(200);
  const cleanU8 = new Uint8Array(clean);
  const fmtAndDataLen = 8 + 16 + 8 + 200; // fmt header+body + data header+body
  const junkLen = 28;
  // RIFF header (12) + JUNK chunk (8+28) + fmt (8+16) + data (8+200) + trailer
  const trailerLen = 100;
  const out = new ArrayBuffer(12 + 8 + junkLen + fmtAndDataLen + trailerLen);
  const o = new Uint8Array(out);
  const ov = new DataView(out);
  o.set([0x52, 0x49, 0x46, 0x46], 0);
  ov.setUint32(4, out.byteLength - 8, true);
  o.set([0x57, 0x41, 0x56, 0x45], 8);
  // JUNK chunk
  o.set([0x4a, 0x55, 0x4e, 0x4b], 12);
  ov.setUint32(16, junkLen, true);
  // (body left as zeros)
  // fmt + data copied from clean (skip its RIFF header)
  o.set(cleanU8.subarray(12), 12 + 8 + junkLen);
  // Trailer (simulate cue/LIST/smpl chunks)
  o.set([0x63, 0x75, 0x65, 0x20], 12 + 8 + junkLen + fmtAndDataLen); // "cue "
  ov.setUint32(12 + 8 + junkLen + fmtAndDataLen + 4, trailerLen - 8, true);
  return { input: out, expectedDataBytes: 200 };
}

describe("repairWavIfNeeded", () => {
  it("passes a clean WAV through unchanged (zero-copy)", () => {
    const clean = buildMinimalWav();
    const out = repairWavIfNeeded(clean);
    expect(out).toBe(clean);
  });

  it("strips JUNK and trailing chunks, preserves audio bytes", () => {
    const { input, expectedDataBytes } = buildDawWav();
    const out = repairWavIfNeeded(input);
    expect(out).not.toBe(input);
    expect(out.byteLength).toBe(44 + expectedDataBytes);
    const u8 = new Uint8Array(out);
    expect(String.fromCharCode(u8[0], u8[1], u8[2], u8[3])).toBe("RIFF");
    expect(String.fromCharCode(u8[8], u8[9], u8[10], u8[11])).toBe("WAVE");
    expect(String.fromCharCode(u8[12], u8[13], u8[14], u8[15])).toBe("fmt ");
    expect(String.fromCharCode(u8[36], u8[37], u8[38], u8[39])).toBe("data");
    // Audio bytes preserved byte-for-byte (silence = 0x80 from buildMinimalWav)
    expect(u8[44]).toBe(0x80);
    expect(u8[44 + expectedDataBytes - 1]).toBe(0x80);
  });

  it("returns input unchanged for non-WAV (no RIFF magic)", () => {
    const mp3 = new ArrayBuffer(64);
    new Uint8Array(mp3).set([0x49, 0x44, 0x33]); // ID3v2
    expect(repairWavIfNeeded(mp3)).toBe(mp3);
  });

  it("returns input unchanged for files under 12 bytes", () => {
    const tiny = new ArrayBuffer(8);
    expect(repairWavIfNeeded(tiny)).toBe(tiny);
  });

  it("returns input unchanged when fmt or data missing (un-repairable)", () => {
    // RIFF + WAVE but no chunks
    const broken = new ArrayBuffer(12);
    const u = new Uint8Array(broken);
    u.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(repairWavIfNeeded(broken)).toBe(broken);
  });

  it("passes a clean FLOAT-32 WAV through unchanged (decodeAudioData handles it)", () => {
    // Web Audio's decodeAudioData supports IEEE-float natively (v0.0.16) —
    // no transcode needed, fast path stays zero-copy.
    const samples = new Float32Array([0.0, 1.0, -1.0, 0.5]);
    const fmtLen = 16;
    const buf = new ArrayBuffer(12 + 8 + fmtLen + 8 + samples.byteLength);
    const u8 = new Uint8Array(buf);
    const v = new DataView(buf);
    u8.set([0x52, 0x49, 0x46, 0x46], 0);
    v.setUint32(4, buf.byteLength - 8, true);
    u8.set([0x57, 0x41, 0x56, 0x45], 8);
    u8.set([0x66, 0x6d, 0x74, 0x20], 12);
    v.setUint32(16, fmtLen, true);
    v.setUint16(20, 3, true); // FLOAT
    v.setUint16(22, 1, true);
    v.setUint32(24, 44100, true);
    v.setUint32(28, 44100 * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 32, true);
    u8.set([0x64, 0x61, 0x74, 0x61], 36);
    v.setUint32(40, samples.byteLength, true);
    for (let i = 0; i < samples.length; i++) v.setFloat32(44 + i * 4, samples[i], true);

    const out = repairWavIfNeeded(buf);
    expect(out).toBe(buf); // zero-copy
  });

  it("FLOAT-32 with JUNK still preserves FLOAT formatCode in rebuild", () => {
    // DAW WAV: JUNK + fmt(format=3) + data + smpl trailer. Junk-strip path
    // runs, but the fmt block (including formatCode=3) is preserved verbatim.
    const samples = new Float32Array([0.5, -0.5]);
    const dataLen = samples.byteLength;
    const junkLen = 28;
    const trailerLen = 16;
    const fmtLen = 16;
    const total = 12 + 8 + junkLen + 8 + fmtLen + 8 + dataLen + 8 + trailerLen;
    const buf = new ArrayBuffer(total);
    const u8 = new Uint8Array(buf);
    const v = new DataView(buf);
    let p = 0;
    u8.set([0x52, 0x49, 0x46, 0x46], p);
    p += 4;
    v.setUint32(p, total - 8, true);
    p += 4;
    u8.set([0x57, 0x41, 0x56, 0x45], p);
    p += 4;
    u8.set([0x4a, 0x55, 0x4e, 0x4b], p);
    p += 4;
    v.setUint32(p, junkLen, true);
    p += 4;
    p += junkLen;
    u8.set([0x66, 0x6d, 0x74, 0x20], p);
    p += 4;
    v.setUint32(p, fmtLen, true);
    p += 4;
    v.setUint16(p, 3, true);
    p += 2; // FLOAT
    v.setUint16(p, 1, true);
    p += 2;
    v.setUint32(p, 44100, true);
    p += 4;
    v.setUint32(p, 44100 * 4, true);
    p += 4;
    v.setUint16(p, 4, true);
    p += 2;
    v.setUint16(p, 32, true);
    p += 2;
    u8.set([0x64, 0x61, 0x74, 0x61], p);
    p += 4;
    v.setUint32(p, dataLen, true);
    p += 4;
    for (let i = 0; i < samples.length; i++) {
      v.setFloat32(p, samples[i], true);
      p += 4;
    }
    u8.set([0x73, 0x6d, 0x70, 0x6c], p);
    p += 4;
    v.setUint32(p, trailerLen, true);
    p += 4;

    const out = repairWavIfNeeded(buf);
    expect(out).not.toBe(buf);
    const ov = new DataView(out);
    // formatCode in output should still be FLOAT (3) — not transcoded.
    expect(ov.getUint16(20, true)).toBe(3);
    expect(ov.getUint16(34, true)).toBe(32); // bits=32 preserved
    // Output = 12 (RIFF/WAVE) + 8 (fmt hdr) + 16 (fmt body) + 8 (data hdr) + 8 (data)
    expect(out.byteLength).toBe(52);
    // Data samples passed through unchanged.
    expect(ov.getFloat32(44, true)).toBeCloseTo(0.5, 5);
    expect(ov.getFloat32(48, true)).toBeCloseTo(-0.5, 5);
  });

  it("unwraps WAVE_FORMAT_EXTENSIBLE (0xFFFE) wrapping PCM", () => {
    // EXTENSIBLE with PCM GUID in SubFormat. Chromium often rejects 0xFFFE.
    const dataLen = 8;
    const fmtLen = 40; // EXTENSIBLE fmt = 16 base + 24 extension
    const buf = new ArrayBuffer(12 + 8 + fmtLen + 8 + dataLen);
    const u8 = new Uint8Array(buf);
    const v = new DataView(buf);
    u8.set([0x52, 0x49, 0x46, 0x46], 0);
    v.setUint32(4, buf.byteLength - 8, true);
    u8.set([0x57, 0x41, 0x56, 0x45], 8);
    u8.set([0x66, 0x6d, 0x74, 0x20], 12);
    v.setUint32(16, fmtLen, true);
    v.setUint16(20, 0xfffe, true); // EXTENSIBLE
    v.setUint16(22, 2, true);
    v.setUint32(24, 44100, true);
    v.setUint32(28, 176400, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    // Extension at offset 36: cbSize(2) + validBitsPerSample(2) + channelMask(4) + SubFormat GUID(16)
    v.setUint16(36, 22, true); // cbSize
    v.setUint16(38, 16, true); // validBitsPerSample
    v.setUint32(40, 3, true); // channelMask = stereo
    // SubFormat GUID = PCM: 01 00 00 00 ... (first 2 bytes = 0x0001 = PCM)
    v.setUint16(44, 1, true); // first 2 bytes of GUID = format code 1 (PCM)
    u8.set([0x64, 0x61, 0x74, 0x61], 60);
    v.setUint32(64, dataLen, true);

    const out = repairWavIfNeeded(buf);
    expect(out).not.toBe(buf);
    const ov = new DataView(out);
    // formatCode in output should be plain PCM (1), NOT 0xfffe.
    expect(ov.getUint16(20, true)).toBe(1);
  });

  it("strips bext (Broadcast Wave) chunk before fmt", () => {
    // bext chunk is common in DAW exports (Pro Tools, Logic). Chromium rejects
    // WAVs with bext even though it's a valid RIFF chunk. We must repair.
    const clean = buildMinimalWav(200);
    const cleanU8 = new Uint8Array(clean);
    const bextLen = 64; // realistic bext body size
    const out = new ArrayBuffer(12 + 8 + bextLen + (clean.byteLength - 12));
    const o = new Uint8Array(out);
    const ov = new DataView(out);
    o.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
    ov.setUint32(4, out.byteLength - 8, true);
    o.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
    // bext chunk header + body (left as zeros)
    o.set([0x62, 0x65, 0x78, 0x74], 12);
    ov.setUint32(16, bextLen, true);
    // fmt + data after bext
    o.set(cleanU8.subarray(12), 12 + 8 + bextLen);

    const repaired = repairWavIfNeeded(out);
    expect(repaired).not.toBe(out);
    // Should be a clean 44+200 byte WAV now
    expect(repaired.byteLength).toBe(244);
    const u8 = new Uint8Array(repaired);
    expect(String.fromCharCode(u8[12], u8[13], u8[14], u8[15])).toBe("fmt ");
    expect(String.fromCharCode(u8[36], u8[37], u8[38], u8[39])).toBe("data");
  });

  it("strips LIST chunk between fmt and data", () => {
    // Some apps insert INFO/LIST metadata between fmt and data.
    const clean = buildMinimalWav(200);
    const cleanU8 = new Uint8Array(clean);
    // Parse clean: fmt is at [12..36) (8 header + 16 body), data is at [36..44+200)
    const listLen = 32;
    const out = new ArrayBuffer(clean.byteLength + 8 + listLen);
    const o = new Uint8Array(out);
    const ov = new DataView(out);
    o.set(cleanU8.subarray(0, 36)); // RIFF + WAVE + fmt
    // Insert LIST chunk after fmt
    o.set([0x4c, 0x49, 0x53, 0x54], 36);
    ov.setUint32(40, listLen, true);
    // copy data chunk after LIST
    o.set(cleanU8.subarray(36), 36 + 8 + listLen);
    // Patch the outer RIFF size
    ov.setUint32(4, out.byteLength - 8, true);

    const repaired = repairWavIfNeeded(out);
    expect(repaired).not.toBe(out);
    const u8 = new Uint8Array(repaired);
    expect(String.fromCharCode(u8[36], u8[37], u8[38], u8[39])).toBe("data");
  });

  it("clamps malformed chunk size against file end", () => {
    // Build a WAV whose data chunk claims more bytes than the file holds.
    const buf = buildMinimalWav(200);
    const v = new DataView(buf);
    v.setUint32(40, 99999, true); // data chunk size = 99999 (file only has 200)
    // We also need a JUNK chunk to force the rebuild path
    const dawWith = new ArrayBuffer(buf.byteLength + 8 + 4);
    const o = new Uint8Array(dawWith);
    const ov = new DataView(dawWith);
    o.set([0x52, 0x49, 0x46, 0x46], 0);
    ov.setUint32(4, dawWith.byteLength - 8, true);
    o.set([0x57, 0x41, 0x56, 0x45], 8);
    // JUNK + 4-byte body
    o.set([0x4a, 0x55, 0x4e, 0x4b], 12);
    ov.setUint32(16, 4, true);
    // copy fmt + data (with the malformed data size) from buf, skipping its RIFF header
    o.set(new Uint8Array(buf).subarray(12), 24);
    // Should not throw, should clamp the data length down.
    const out = repairWavIfNeeded(dawWith);
    expect(out).not.toBe(dawWith);
    // Data length should be capped to actual remaining bytes
    const ov2 = new DataView(out);
    const dataLen = ov2.getUint32(40, true);
    expect(dataLen).toBeLessThanOrEqual(200);
  });
});

describe("handleAssetRequest", () => {
  it("returns 503 when apiPort is null", async () => {
    const resp = await handleAssetRequest(new Request("beatos-asset://cover/1"), {
      apiPort: () => null,
      fetchImpl: mockFetch(() => new Response()),
    });
    expect(resp.status).toBe(503);
  });

  it("returns 404 for unknown host", async () => {
    const resp = await handleAssetRequest(new Request("beatos-asset://unknown/1"), {
      apiPort: () => 8000,
      fetchImpl: mockFetch(() => new Response()),
    });
    expect(resp.status).toBe(404);
  });

  it("dispatches cover to /api/assets/cover/<id>", async () => {
    const f = mockFetch((url) => {
      expect(url).toBe("http://127.0.0.1:8000/api/assets/cover/42");
      return new Response("ok", { status: 200, headers: { "content-type": "image/png" } });
    });
    const resp = await handleAssetRequest(new Request("beatos-asset://cover/42"), {
      apiPort: () => 8000,
      fetchImpl: f,
    });
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("image/png");
  });

  it("dispatches audio to /api/assets/audio/<id>", async () => {
    const f = mockFetch((url) => {
      expect(url).toBe("http://127.0.0.1:8000/api/assets/audio/7");
      return new Response(buildMinimalWav(), {
        status: 200,
        headers: { "content-type": "audio/wav" },
      });
    });
    const resp = await handleAssetRequest(new Request("beatos-asset://audio/7"), {
      apiPort: () => 8000,
      fetchImpl: f,
    });
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("audio/wav");
  });

  it("normalizes audio/x-wav → audio/wav (Chromium media stack picky)", async () => {
    const f = mockFetch(
      () =>
        new Response(buildMinimalWav(), {
          status: 200,
          headers: { "content-type": "audio/x-wav" },
        }),
    );
    const resp = await handleAssetRequest(new Request("beatos-asset://audio/1"), {
      apiPort: () => 8000,
      fetchImpl: f,
    });
    expect(resp.headers.get("content-type")).toBe("audio/wav");
  });

  it("does NOT forward Range header (avoids two-phase request mismatch)", async () => {
    const f = mockFetch((_url, init) => {
      const range = (init?.headers as Record<string, string> | undefined)?.range;
      expect(range).toBeUndefined();
      return new Response(buildMinimalWav(), {
        status: 200,
        headers: { "content-type": "audio/wav" },
      });
    });
    const req = new Request("beatos-asset://audio/7", { headers: { range: "bytes=0-1023" } });
    const resp = await handleAssetRequest(req, { apiPort: () => 8000, fetchImpl: f });
    expect(resp.status).toBe(200);
  });

  it("repairs DAW WAV with JUNK + trailing chunks", async () => {
    const { input } = buildDawWav();
    const f = mockFetch(
      () => new Response(input, { status: 200, headers: { "content-type": "audio/wav" } }),
    );
    const resp = await handleAssetRequest(new Request("beatos-asset://audio/1"), {
      apiPort: () => 8000,
      fetchImpl: f,
    });
    const out = await resp.arrayBuffer();
    expect(out.byteLength).toBeLessThan(input.byteLength);
    const u = new Uint8Array(out);
    // First chunk after WAVE must be fmt (not JUNK)
    expect(String.fromCharCode(u[12], u[13], u[14], u[15])).toBe("fmt ");
  });
});
