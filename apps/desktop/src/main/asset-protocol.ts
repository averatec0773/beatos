export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface AssetProtocolDeps {
  apiPort: () => number | null;
  fetchImpl?: FetchLike;
}

const COVER_DEFAULT_MIME = "image/jpeg";
const AUDIO_DEFAULT_MIME = "audio/mpeg";

/**
 * Sanitize a WAV file by keeping only RIFF header + fmt chunk + data chunk.
 *
 * Why this exists even with Web Audio's `decodeAudioData` doing the heavy
 * lifting: some DAWs emit WAVs with a JUNK chunk before fmt (Pro Tools'
 * 4 KB sector-align padding) and/or cue/LIST/smpl chunks after data
 * (markers, loop points). Chromium's WAV decoder — shared between the
 * `<audio>` media stack and `decodeAudioData` — has historically been
 * picky about extra RIFF chunks. We preserve the audio bytes verbatim
 * and drop the metadata Chromium might not parse.
 *
 * What we DO NOT do anymore (v0.0.16):
 *   - FLOAT-32 → PCM-16 transcoding. `decodeAudioData` handles IEEE-float
 *     32-bit and 24-bit PCM natively. The fmt block is preserved as-is,
 *     so the decoder still sees `formatCode=3` and decodes correctly.
 *
 * Returns the input unchanged when it's already a canonical `{ fmt, data }`
 * RIFF, keeping the common path zero-copy.
 */
export function repairWavIfNeeded(buffer: ArrayBuffer): ArrayBuffer {
  if (buffer.byteLength < 12) return buffer;
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  const riff = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
  const wave = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]);
  if (riff !== "RIFF" || wave !== "WAVE") return buffer;

  // Walk the chunks. RIFF chunk header is 8 bytes: 4-byte id + 4-byte LE size.
  // We accept ONLY the canonical { fmt, data } structure as clean.
  let pos = 12;
  let fmtStart = -1, fmtLen = -1;
  let dataStart = -1, dataLen = -1;
  let extraChunkCount = 0;
  const seenIds: string[] = [];
  while (pos + 8 <= buffer.byteLength) {
    const id = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
    const size = view.getUint32(pos + 4, true);
    const bodyStart = pos + 8;
    const safeSize = Math.min(size, buffer.byteLength - bodyStart);
    if (safeSize < 0) break;
    seenIds.push(id);
    if (id === "fmt ") {
      fmtStart = bodyStart;
      fmtLen = safeSize;
    } else if (id === "data") {
      dataStart = bodyStart;
      dataLen = safeSize;
    } else {
      extraChunkCount++;
    }
    // RIFF chunks pad to an even byte if size is odd.
    pos = bodyStart + safeSize + (safeSize & 1);
  }

  if (fmtStart < 0 || dataStart < 0 || fmtLen <= 0 || dataLen <= 0) return buffer;

  // Read enough of fmt to detect EXTENSIBLE wrapping (fmt[0..2] = formatCode).
  //   1 = PCM, 3 = IEEE FLOAT, 0xFFFE = EXTENSIBLE
  // EXTENSIBLE wraps a 16-byte SubFormat GUID starting at fmt+24; its first
  // 2 bytes carry the real format code we want to expose.
  const rawFormatCode = fmtLen >= 2 ? view.getUint16(fmtStart, true) : 1;
  const isExtensible = rawFormatCode === 0xfffe;
  let unwrappedFormatCode = rawFormatCode;
  if (isExtensible && fmtLen >= 26) {
    const sub = view.getUint16(fmtStart + 24, true);
    if (sub === 1 || sub === 3) unwrappedFormatCode = sub;
  }

  // Fast path: clean RIFF (only fmt+data) and not EXTENSIBLE. PCM and
  // FLOAT-32 both decode natively under decodeAudioData, so neither needs
  // a rewrite.
  if (
    extraChunkCount === 0 &&
    seenIds.length === 2 &&
    seenIds[0] === "fmt " &&
    seenIds[1] === "data" &&
    !isExtensible
  ) {
    return buffer;
  }

  // Rebuild path: preserve fmt + data verbatim, drop everything else.
  const fmtPad = fmtLen & 1;
  const outSize = 12 + 8 + fmtLen + fmtPad + 8 + dataLen;
  const out = new ArrayBuffer(outSize);
  const outU8 = new Uint8Array(out);
  const outView = new DataView(out);
  outU8.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  outView.setUint32(4, outSize - 8, true);
  outU8.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  outU8.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  outView.setUint32(16, fmtLen, true);
  outU8.set(u8.subarray(fmtStart, fmtStart + fmtLen), 20);
  // Unwrap EXTENSIBLE → expose PCM (1) or FLOAT (3) directly so decoders that
  // dislike 0xFFFE see a plain format code.
  if (isExtensible && unwrappedFormatCode !== rawFormatCode) {
    outView.setUint16(20, unwrappedFormatCode, true);
  }
  if (fmtPad) outU8[20 + fmtLen] = 0;
  const dataChunkStart = 20 + fmtLen + fmtPad;
  outU8.set([0x64, 0x61, 0x74, 0x61], dataChunkStart); // "data"
  outView.setUint32(dataChunkStart + 4, dataLen, true);
  outU8.set(u8.subarray(dataStart, dataStart + dataLen), dataChunkStart + 8);
  return out;
}

export async function handleAssetRequest(
  request: Request,
  deps: AssetProtocolDeps
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const assetId = url.pathname.replace(/^\//, "");
    const port = deps.apiPort();
    if (port == null) return new Response(null, { status: 503 });

    let upstreamPath: string;
    let defaultMime: string;
    if (url.host === "cover") {
      upstreamPath = `/api/assets/cover/${assetId}`;
      defaultMime = COVER_DEFAULT_MIME;
    } else if (url.host === "audio") {
      upstreamPath = `/api/assets/audio/${assetId}`;
      defaultMime = AUDIO_DEFAULT_MIME;
    } else {
      return new Response(null, { status: 404 });
    }

    // IMPORTANT: do NOT forward the client's Range header to the upstream.
    // Chrome's WebMediaPlayer makes a two-phase request pattern for media
    // probing (initial range + tail range), and reconstructing that pattern
    // through an HTTP proxy in protocol.handle is fragile — we previously
    // hit MEDIA_ERR_SRC_NOT_SUPPORTED because of subtle byte/header mismatches.
    //
    // Instead, always fetch the full file from the sidecar (one bounded
    // round trip), buffer it, and return 200 OK *without* accept-ranges.
    // Chrome will then load the entire buffer in one shot — the audio
    // element supports HAVE_METADATA / HAVE_ENOUGH_DATA from an in-memory
    // buffer just fine for files of this size.
    const f: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    const upstream = await f(`http://127.0.0.1:${port}${upstreamPath}`);
    if (!upstream.ok && upstream.status !== 206) {
      return new Response(null, { status: upstream.status });
    }
    let buffer = await upstream.arrayBuffer();
    // WAV repair pass (see repairWavIfNeeded comment for rationale).
    if (url.host === "audio") buffer = repairWavIfNeeded(buffer);

    // Normalize WAV mime variants — Chromium's media stack is picky and
    // rejects audio/x-wav (which macOS' mimetypes module returns by default).
    let contentType = upstream.headers.get("content-type") ?? defaultMime;
    if (contentType === "audio/x-wav" || contentType === "audio/vnd.wave") {
      contentType = "audio/wav";
    }
    const respHeaders: Record<string, string> = {
      "content-type": contentType,
      "content-length": String(buffer.byteLength),
      "cache-control": "no-store",
    };
    return new Response(buffer, { status: 200, headers: respHeaders });
  } catch (e) {
    console.warn("[protocol:beatos-asset] error", e);
    return new Response(null, { status: 500 });
  }
}
