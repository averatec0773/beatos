// Pure fixture data + builders. No I/O, no Electron, no Playwright.

// Minimal valid 1x1 PNG (67 bytes).
export const TINY_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

// Minimal valid WAV: 8 kHz, 8-bit mono, 5 s silence (40000 samples of 0x80).
// 5 s guarantees the audio element stays in "playing" state long enough for
// the smoke's waitForSelector to catch data-playing="true" before onEnded fires.
export function makeTinyWav() {
  const numSamples = 40000; // 5 s @ 8000 Hz
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 8;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  let off = 0;
  // RIFF chunk
  buf.write("RIFF", off);
  off += 4;
  buf.writeUInt32LE(36 + dataSize, off);
  off += 4;
  buf.write("WAVE", off);
  off += 4;
  // fmt  sub-chunk
  buf.write("fmt ", off);
  off += 4;
  buf.writeUInt32LE(16, off);
  off += 4; // sub-chunk size
  buf.writeUInt16LE(1, off);
  off += 2; // PCM
  buf.writeUInt16LE(numChannels, off);
  off += 2;
  buf.writeUInt32LE(sampleRate, off);
  off += 4;
  buf.writeUInt32LE(byteRate, off);
  off += 4;
  buf.writeUInt16LE(blockAlign, off);
  off += 2;
  buf.writeUInt16LE(bitsPerSample, off);
  off += 2;
  // data sub-chunk
  buf.write("data", off);
  off += 4;
  buf.writeUInt32LE(dataSize, off);
  off += 4;
  buf.fill(0x80, off); // 0x80 = silence for unsigned 8-bit PCM
  return buf;
}

/**
 * Build a "DAW-style" WAV: clean fmt+data wrapped with a JUNK chunk before
 * fmt (Pro Tools/FL Studio sector-align padding) and a fake cue chunk after
 * data (markers). Chromium's WAV decoder pre-v0.0.14.1 rejected these with
 * empty-message MEDIA_ERR_SRC_NOT_SUPPORTED; the asset-protocol repair pass
 * sidesteps that. This fixture pins the regression.
 */
export function makeDawStyleWav() {
  const clean = makeTinyWav(); // 44-byte header + 40000 bytes of data = 40044
  const junkLen = 28;
  const trailerLen = 100;
  const out = Buffer.alloc(12 + 8 + junkLen + (clean.length - 12) + trailerLen);
  let off = 0;
  // RIFF + size + WAVE
  out.write("RIFF", off);
  off += 4;
  out.writeUInt32LE(out.length - 8, off);
  off += 4;
  out.write("WAVE", off);
  off += 4;
  // JUNK chunk (28 zero bytes — sector-align padding)
  out.write("JUNK", off);
  off += 4;
  out.writeUInt32LE(junkLen, off);
  off += 4;
  off += junkLen;
  // fmt + data copied verbatim from clean (skip its 12-byte RIFF header)
  clean.copy(out, off, 12);
  off += clean.length - 12;
  // Trailer: simulate a "cue " chunk with bogus body — must be ignored
  out.write("cue ", off);
  off += 4;
  out.writeUInt32LE(trailerLen - 8, off);
  off += 4;
  return out;
}
