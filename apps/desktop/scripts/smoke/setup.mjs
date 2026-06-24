// Boot orchestration: artifact purge, electron.launch, ctx assembly, log assertions.
import { _electron as electron } from "playwright";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Purge smoke artifacts older than 3 days so the logs dir doesn't grow unbounded.
// Only matches `smoke-<digits>.{png,jsonl}` — leaves main.log / sidecar.jsonl alone.
export function purgeOldArtifacts(logsDir) {
  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const artifact = /^smoke-\d+\.(png|jsonl)$/;
  let purged = 0;
  for (const name of readdirSync(logsDir)) {
    if (!artifact.test(name)) continue;
    const full = join(logsDir, name);
    try {
      if (statSync(full).mtimeMs < cutoff) {
        unlinkSync(full);
        purged++;
      }
    } catch {
      // Best-effort cleanup; ignore races (file vanished between readdir+stat).
    }
  }
  if (purged > 0) console.log(`smoke: purged ${purged} stale artifact(s) >3d old`);
}

export function bootstrapPaths(scriptDirname) {
  const repoRoot = resolve(scriptDirname, "..");
  const mainEntry = join(repoRoot, "out/main/index.js");
  if (!existsSync(mainEntry)) {
    console.error("smoke: out/main/index.js missing. Run `npm run build` first.");
    process.exit(2);
  }
  const userData = mkdtempSync(join(tmpdir(), "beatos-smoke-"));
  const logsDir = join(repoRoot, "logs");
  mkdirSync(logsDir, { recursive: true });
  purgeOldArtifacts(logsDir);
  const ts = Date.now();
  return {
    repoRoot,
    mainEntry,
    userData,
    logsDir,
    ts,
    logPath: join(logsDir, `smoke-${ts}.jsonl`),
    dbPath: join(userData, "smoke.db"),
    screenshotPath: join(logsDir, `smoke-${ts}.png`),
  };
}

export async function launchApp({ mainEntry, dbPath, logPath }) {
  // Default behavior: window stays hidden + audio is muted so smoke runs in the
  // background without stealing focus or producing sound. Override by passing
  // SMOKE_SHOW=1 (visible window) or SMOKE_UNMUTED=1 (real audio) on the CLI.
  const showWindow = process.env.SMOKE_SHOW === "1";
  const unmuted = process.env.SMOKE_UNMUTED === "1";
  return await electron.launch({
    args: [mainEntry, "--smoke", "--no-splash"],
    env: {
      ...process.env,
      BEATOS_DB_PATH: dbPath,
      BEATOS_LOG_PATH: logPath,
      // Keep the fresh smoke DB empty so row-count assertions are deterministic
      // (the first-launch demo track would otherwise add a 3rd row).
      BEATOS_DISABLE_DEMO_SEED: "1",
      ...(showWindow ? {} : { BEATOS_HEADLESS: "1" }),
      ...(unmuted ? {} : { BEATOS_AUDIO_MUTED: "1" }),
    },
    timeout: 30_000,
  });
}

// Sidecar log validation: file must exist and contain no ERROR-level lines.
// Returns array of failure strings (empty if all good).
export function checkSidecarLog(logPath) {
  const failures = [];
  if (!existsSync(logPath)) {
    failures.push(`sidecar log file never appeared at ${logPath}`);
    return failures;
  }
  const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
  let malformed = 0;
  const errors = lines
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        malformed += 1;
        return null;
      }
    })
    .filter((e) => e && e.level === "error");
  if (errors.length > 0) {
    failures.push(`sidecar emitted ${errors.length} error(s); first: ${JSON.stringify(errors[0])}`);
  }
  if (malformed > 0) {
    failures.push(`sidecar log had ${malformed} malformed JSON line(s)`);
  }
  return failures;
}

// Read the handshake JSON written by the Electron main process. Returns baseUrl.
export function readHandshakeBaseUrl(userDataApp) {
  const handshakePath = join(userDataApp, "runtime", "handshake.json");
  if (!existsSync(handshakePath)) {
    throw new Error(`handshake missing at ${handshakePath}`);
  }
  const handshake = JSON.parse(readFileSync(handshakePath, "utf-8"));
  if (typeof handshake.port !== "number") {
    throw new Error(`handshake.port not a number: ${JSON.stringify(handshake)}`);
  }
  return `http://127.0.0.1:${handshake.port}`;
}

// API helpers — closures over baseUrl. Returned together so sections can pull
// what they need from ctx without re-instantiating per call.
export function makeApi(baseUrl) {
  async function postJson(path, body) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`POST ${path} -> ${res.status} ${detail.slice(0, 200)}`);
    }
    return res.status === 204 ? null : await res.json();
  }
  async function putJson(path, body) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`PUT ${path} -> ${res.status} ${detail.slice(0, 200)}`);
    }
    return res.status === 204 ? null : await res.json();
  }
  return { postJson, putJson };
}
