#!/usr/bin/env node
/**
 * Web smoke: boot the sidecar in web mode (serving out/web), open the SPA in
 * Chromium, verify the dual-frontend vertical slice works end-to-end.
 *
 * Required: `npm run build:web` first (exits 2 if out/web is missing).
 * Asserts: SPA mounts · seeded track is visible · audio engine leaves idle
 *          after the user starts playback (exercises /api/assets/audio + WAV repair).
 * Outputs: logs/smoke-web-<ts>.png
 * Exit codes: 0 PASS, 1 FAIL, 2 prereq missing.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

import { makeDawStyleWav, TINY_PNG } from "./smoke/fixtures.mjs";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const repoRoot = resolve(import.meta.dirname, "../../..");
const webDir = resolve(import.meta.dirname, "../out/web");
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const logsDir = resolve(import.meta.dirname, "../logs");
mkdirSync(logsDir, { recursive: true });
const screenshotPath = resolve(logsDir, `smoke-web-${ts}.png`);

if (!existsSync(join(webDir, "index.html"))) {
  console.error("smoke-web: out/web/index.html missing — run `npm run build:web` first");
  process.exit(2);
}

const userData = mkdtempSync(join(tmpdir(), "beatos-web-smoke-"));
const dbPath = join(userData, "global.db");
const failures = [];
let exitCode = 0;
let sidecar, browser;
let sidecarExit = null; // { code, signal } once the sidecar process exits

// Candidate WAV seeded at HOME root for the file-browser add-audio test (not a
// dotfile — /api/fs/list hides dotfiles). Cleaned up in the finally block.
const candidateWavName = `beatos-web-smoke-${ts}.wav`;
const candidateWavPath = join(homedir(), candidateWavName);

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (sidecarExit) {
      // The sidecar died before serving — most likely BEATOS_HTTP_PORT is in use
      // (main() raises SystemExit). Surface that instead of a 15s misleading wait.
      throw new Error(
        `sidecar exited early (code=${sidecarExit.code}, signal=${sidecarExit.signal}) ` +
          `before becoming healthy — port ${PORT} may already be in use`,
      );
    }
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function postJson(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

try {
  sidecar = spawn("uv", ["run", "python", "-m", "beatos_http"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BEATOS_HTTP_PORT: String(PORT),
      BEATOS_DB_PATH: dbPath,
      BEATOS_WEB_DIR: webDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  sidecar.on("exit", (code, signal) => {
    sidecarExit = { code, signal };
  });
  sidecar.stderr.on("data", (d) => {
    const s = String(d);
    if (/error|traceback|systemexit|in use/i.test(s)) failures.push(`sidecar: ${s.trim()}`);
  });

  if (!(await waitForHealth())) throw new Error("sidecar did not become healthy within 15s");

  // Seed: a track with a DAW-style WAV (exercises server-side repair) + a cover.
  const track = await postJson("/api/tracks", { title: "Web Smoke Beat" });
  const wavPath = join(userData, "beat.wav");
  const coverPath = join(userData, "cover.png");
  writeFileSync(wavPath, makeDawStyleWav());
  writeFileSync(coverPath, TINY_PNG);
  await postJson(`/api/tracks/${track.id}/assets`, { role: "audio_tagged_wav", path: wavPath });
  await postJson(`/api/tracks/${track.id}/assets`, { role: "cover", path: coverPath });

  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (e) => failures.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") failures.push(`console.error: ${m.text()}`);
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#root > *", { timeout: 8000 });

  // Assert the seeded track title is visible in the library.
  await page
    .waitForFunction(() => document.body.innerText.includes("Web Smoke Beat"), { timeout: 8000 })
    .catch(() => failures.push("seeded track title not visible in library"));

  // Assert the debug surface is available.
  await page.waitForFunction(() => !!window.__beatos?.engine, { timeout: 5000 });

  // Trigger playback: click the play button on the row that has audio
  // (matches the pattern in scripts/smoke/player.mjs::assertPlaybackStarts).
  // The row was just seeded so it should be [data-has-audio="true"][data-row-play-button].
  const playableBtn = page.locator('[data-has-audio="true"][data-row-play-button]').first();
  const playableBtnCount = await playableBtn.count();
  if (playableBtnCount > 0) {
    await playableBtn.click();
    // Wait up to 10s for engine to leave idle (loading → playing/paused).
    // Same-origin /api/assets/audio fetch + server-side WAV repair runs during this window.
    try {
      await page.waitForFunction(() => window.__beatos.engine().status !== "idle", {
        timeout: 10000,
      });
      // After leaving idle, wait a further 2s for position to advance (mirrors assertDawWavDecode).
      await new Promise((r) => setTimeout(r, 2000));
      const engineState = await page.evaluate(() => window.__beatos.engine());
      if (engineState.status === "error") {
        failures.push(
          `playback: engine status=error (WAV decode or fetch failed) — duration=${engineState.duration}, assetId=${engineState.currentAssetId}`,
        );
      } else if (!(engineState.duration > 0)) {
        failures.push(
          `playback: duration not > 0 (${engineState.duration}), status=${engineState.status}`,
        );
      } else if (!(engineState.position > 0)) {
        failures.push(
          `playback: position did not advance (${engineState.position}), status=${engineState.status}`,
        );
      } else {
        console.log(
          `smoke-web: DAW-WAV playback PASS (status=${engineState.status}, duration=${engineState.duration.toFixed(2)}s, position=${engineState.position.toFixed(2)}s, assetId=${engineState.currentAssetId})`,
        );
      }
    } catch {
      const engineState = await page.evaluate(() => window.__beatos?.engine?.()).catch(() => null);
      const statusStr = engineState ? engineState.status : "unavailable";
      failures.push(
        `playback: engine never left idle state after 10s (status=${statusStr}) — /api/assets/audio or WAV repair may have failed`,
      );
    }
  } else {
    failures.push(
      "playback: no [data-has-audio=true][data-row-play-button] found — audio asset may not have been indexed",
    );
  }

  // -----------------------------------------------------------------------
  // Add-audio via file browser (Part B): create a fresh track with no audio,
  // seed a candidate WAV at the home root, navigate to the editor, open the
  // FileBrowserDialog via the "+ Add file" button, select the file, and verify
  // that the track now has an audio asset via the API.
  // -----------------------------------------------------------------------
  try {
    // 1. Seed the candidate WAV at home root (non-dotfile — listing shows it).
    writeFileSync(candidateWavPath, makeDawStyleWav());

    // 2. Create a second track with no audio.
    const emptyTrack = await postJson("/api/tracks", { title: "Web Smoke Add Audio" });

    // 3. Navigate to the track editor route (HashRouter: /#/tracks/{id}/edit).
    await page.goto(`${BASE}/#/tracks/${emptyTrack.id}/edit`, { waitUntil: "domcontentloaded" });
    // Wait for the editor container, then wait for the file rows to load
    // (they only render after the track + asset fetch resolves).
    await page.waitForSelector("[data-track-editor]", { timeout: 8000 });
    await page.waitForSelector("[data-file-row]", { timeout: 8000 });

    // 4. Click the "+ Add file" button on the first empty audio row (audio_tagged_wav).
    //    AudioFileRow renders the button with text from i18n key fileRows.addFile = "+ Add file".
    //    Use a text locator to be robust against exact whitespace variations.
    const addFileBtn = page.locator('[data-file-row][data-empty="true"]').first().locator('button', { hasText: /\+ Add file/i });
    await addFileBtn.waitFor({ timeout: 5000 });
    await addFileBtn.click();

    // 5. Wait for the FileBrowserDialog to open (title "Choose a file").
    const dialog = page.locator('[role="dialog"]').filter({ hasText: "Choose a file" });
    await dialog.waitFor({ timeout: 5000 });

    // 6. Wait for the FS listing to load (the loading indicator disappears and
    //    entries appear). The modal opens at home by default.
    await page.waitForFunction(
      () => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return false;
        // Loading text disappears, at least one button-entry appears
        const btns = d.querySelectorAll("[data-fs-entry]");
        return btns.length > 0;
      },
      { timeout: 8000 },
    );

    // 7. Assert real FS rows rendered (listing is non-empty).
    const entryCount = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? d.querySelectorAll("[data-fs-entry]").length : 0;
    });
    if (entryCount === 0) {
      failures.push("add-audio: FileBrowserDialog opened but shows no FS entries");
    } else {
      console.log(`smoke-web: FileBrowserDialog loaded ${entryCount} FS entries PASS`);
    }

    // 8. Click the candidate WAV row (single-click selects it).
    const candidateRow = dialog.getByRole("button").filter({ hasText: candidateWavName });
    const candidateRowCount = await candidateRow.count();
    if (candidateRowCount === 0) {
      failures.push(
        `add-audio: candidate WAV "${candidateWavName}" not found in FileBrowserDialog listing`,
      );
    } else {
      await candidateRow.first().click();

      // 9. Click the "Select" button (enabled once a file is selected).
      const selectBtn = dialog.getByRole("button", { name: "Select" });
      await selectBtn.waitFor({ timeout: 5000 });
      await selectBtn.click();

      // 10. Poll GET /api/tracks/{id}/assets until an audio-role asset appears.
      const deadline = Date.now() + 6000;
      let attached = false;
      while (Date.now() < deadline) {
        const res = await fetch(`${BASE}/api/tracks/${emptyTrack.id}/assets`);
        if (res.ok) {
          const assets = await res.json();
          if (
            Array.isArray(assets) &&
            assets.some((a) => typeof a.role === "string" && a.role.startsWith("audio"))
          ) {
            attached = true;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      if (attached) {
        console.log(
          `smoke-web: add audio via file browser (modal → real FS → select → asset attached) PASS`,
        );
      } else {
        failures.push(
          `add-audio: selected "${candidateWavName}" but no audio asset appeared on track ${emptyTrack.id} within 6s`,
        );
      }
    }
  } catch (addAudioErr) {
    failures.push(`add-audio: harness error: ${addAudioErr.message}`);
  }

  await page.screenshot({ path: screenshotPath });
  console.log(`smoke-web: screenshot ${screenshotPath}`);

  if (failures.length === 0) {
    console.log("smoke-web: PASS");
  } else {
    exitCode = 1;
    console.error("smoke-web: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
  }
} catch (err) {
  exitCode = 1;
  console.error("smoke-web: harness error:", err.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (sidecar && !sidecarExit) {
    sidecar.kill("SIGTERM");
    // Wait for graceful shutdown (SQLite WAL flush) before removing the temp
    // dir; SIGKILL backstop so the harness never hangs on a stuck child.
    await new Promise((r) => {
      const t = setTimeout(() => {
        try {
          sidecar.kill("SIGKILL");
        } catch {}
        r();
      }, 3000);
      sidecar.once("exit", () => {
        clearTimeout(t);
        r();
      });
    });
  }
  rmSync(userData, { recursive: true, force: true });
  try {
    unlinkSync(candidateWavPath);
  } catch {}
}
process.exit(exitCode);
