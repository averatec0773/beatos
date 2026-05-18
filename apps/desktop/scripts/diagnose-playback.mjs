#!/usr/bin/env node
/**
 * Diagnostic harness for audio playback issues. Boots the built app
 * against a clean temp userData, attaches a WAV file, clicks play, and
 * captures every HTMLMediaElement event with timestamps so we can see
 * exactly where loading fails.
 *
 * Usage:
 *   BEATOS_TEST_AUDIO=/path/to/file.wav node scripts/diagnose-playback.mjs
 *   node scripts/diagnose-playback.mjs --tiny     # 5s 8kHz silent WAV
 *   node scripts/diagnose-playback.mjs --large    # 87s 8kHz silent WAV
 */
import { _electron as electron } from "playwright";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

let audioPath = process.env.BEATOS_TEST_AUDIO ?? process.argv[2];
const useTinyWav = process.argv.includes("--tiny");
const useLargeWav = process.argv.includes("--large");

if (useTinyWav || useLargeWav) {
  const numSamples = useLargeWav ? 700000 : 40000;
  const sampleRate = 8000, numChannels = 1, bitsPerSample = 8;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = numSamples * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  let off = 0;
  buf.write("RIFF", off); off += 4;
  buf.writeUInt32LE(36 + dataSize, off); off += 4;
  buf.write("WAVE", off); off += 4;
  buf.write("fmt ", off); off += 4;
  buf.writeUInt32LE(16, off); off += 4;
  buf.writeUInt16LE(1, off); off += 2;
  buf.writeUInt16LE(numChannels, off); off += 2;
  buf.writeUInt32LE(sampleRate, off); off += 4;
  buf.writeUInt32LE(byteRate, off); off += 4;
  buf.writeUInt16LE(blockAlign, off); off += 2;
  buf.writeUInt16LE(bitsPerSample, off); off += 2;
  buf.write("data", off); off += 4;
  buf.writeUInt32LE(dataSize, off); off += 4;
  buf.fill(0x80, off);
  audioPath = join(tmpdir(), useLargeWav ? "diag-large.wav" : "diag-tiny.wav");
  writeFileSync(audioPath, buf);
  console.log("[diag] generated synthetic WAV at", audioPath);
}

if (!audioPath) {
  console.error("usage: BEATOS_TEST_AUDIO=/path/to/file.wav node scripts/diagnose-playback.mjs [--tiny|--large]");
  process.exit(2);
}
if (!existsSync(audioPath)) {
  console.error("file not found:", audioPath);
  process.exit(2);
}

const userData = mkdtempSync(join(tmpdir(), "beatos-diag-"));
const dbPath = join(userData, "diag.db");
const sourceDir = dirname(audioPath);

console.log("[diag] userData =", userData);
console.log("[diag] db       =", dbPath);
console.log("[diag] audio    =", audioPath);
console.log("[diag] source   =", sourceDir);

// Match smoke defaults: hidden window + muted audio. Pass DIAG_SHOW=1 or
// DIAG_UNMUTED=1 to override when you want to watch / hear what's happening.
const showWindow = process.env.DIAG_SHOW === "1";
const unmuted = process.env.DIAG_UNMUTED === "1";
const app = await electron.launch({
  args: [join(repoRoot, "apps", "desktop", "out", "main", "index.js"), "--no-splash"],
  env: {
    ...process.env,
    BEATOS_DB_PATH: dbPath,
    BEATOS_LOG_PATH: join(userData, "diag.log"),
    BEATOS_USER_DATA: userData,
    NODE_ENV: "production",
    ...(showWindow ? {} : { BEATOS_HEADLESS: "1" }),
    ...(unmuted ? {} : { BEATOS_AUDIO_MUTED: "1" }),
  },
});

app.on("console", (msg) => console.log(`[app:${msg.type()}]`, msg.text()));

const window = await app.firstWindow();
window.on("console", (msg) => console.log(`[renderer:${msg.type()}]`, msg.text()));

await window.waitForLoadState("domcontentloaded");
await new Promise((r) => setTimeout(r, 1500));

const userDataPath = await app.evaluate(({ app }) => app.getPath("userData"));
let apiPort = null;
for (let i = 0; i < 20; i++) {
  try {
    const hs = JSON.parse(readFileSync(join(userDataPath, "runtime", "handshake.json"), "utf-8"));
    apiPort = hs.port ?? null;
    if (apiPort) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
console.log("[diag] apiPort =", apiPort);
if (!apiPort) { await app.close(); throw new Error("apiPort never appeared"); }

const setupResult = await window.evaluate(async ({ apiPort, audioPath, sourceDir }) => {
  const base = `http://127.0.0.1:${apiPort}`;
  const j = (r) => r.json();
  const src = await fetch(`${base}/api/sources`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ root_path: sourceDir, label: "diag-source" }),
  }).then(j);
  const trk = await fetch(`${base}/api/tracks`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "diag-track" }),
  }).then(j);
  const att = await fetch(`${base}/api/tracks/${trk.id}/assets`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "audio_tagged_wav", path: audioPath }),
  }).then(j);
  return { src, trk, att };
}, { apiPort, audioPath, sourceDir });

const assetId = setupResult.att.id;
console.log("[diag] setup =", JSON.stringify(setupResult.att));

console.log("[diag] reloading + instrumenting audio element…");
await window.reload();
await window.waitForLoadState("domcontentloaded");
await new Promise((r) => setTimeout(r, 1500));

await window.evaluate(() => {
  const a = document.querySelector("audio");
  if (!a) { console.warn("[diag] no audio element after reload"); return; }
  const events = [
    "loadstart", "durationchange", "loadedmetadata", "loadeddata",
    "progress", "canplay", "canplaythrough", "play", "playing",
    "pause", "stalled", "suspend", "waiting", "error", "abort",
  ];
  const start = performance.now();
  const fmt = () => `+${(performance.now() - start).toFixed(0)}ms`;
  for (const ev of events) {
    a.addEventListener(ev, () => {
      const err = a.error;
      console.info(
        `[audio-event ${fmt()}] ${ev}`,
        "readyState=", a.readyState,
        "networkState=", a.networkState,
        "duration=", a.duration,
        err ? `error=${err.code}/${err.message ?? ""}` : ""
      );
    });
  }
});

console.log("[diag] clicking play row button…");
await window.locator("[data-has-audio='true'][data-row-play-button]").first().click();

console.log("[diag] watching playback for 7s…");
for (let i = 0; i < 7; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const snap = await window.evaluate(() => {
    const a = document.querySelector("audio");
    if (!a) return null;
    return {
      readyState: a.readyState,
      networkState: a.networkState,
      duration: a.duration,
      currentTime: a.currentTime,
      paused: a.paused,
      ended: a.ended,
      error: a.error ? { code: a.error.code, msg: a.error.message } : null,
    };
  });
  console.log(`[diag t+${i + 1}s]`, JSON.stringify(snap));
}

await app.close();
console.log("[diag] done");
