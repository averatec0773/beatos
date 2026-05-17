#!/usr/bin/env node
/**
 * Smoke harness: boot Electron + sidecar, verify the app reaches a usable state.
 *
 * Required: pre-built app (`npm run build`). Exits 2 if build artifact is missing.
 *
 * Asserts:
 * - Renderer mounts (first window appears + DOMContentLoaded)
 * - Sidecar JSONL log exists after boot
 * - No ERROR-level lines in sidecar JSONL
 *
 * Outputs:
 * - Screenshot at logs/smoke-<ts>.png (always — useful when failures occur)
 *
 * Exit codes: 0 PASS, 1 FAIL, 2 prereq missing
 */
import { _electron as electron } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, promises as fsPromises } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Minimal valid 1x1 PNG (67 bytes).
const TINY_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

// Minimal valid WAV: 8 kHz, 8-bit mono, 5 s silence (40000 samples of 0x80).
// 5 s guarantees the audio element stays in "playing" state long enough for
// the smoke's waitForSelector to catch data-playing="true" before onEnded fires.
function makeTinyWav() {
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
  buf.write("RIFF", off); off += 4;
  buf.writeUInt32LE(36 + dataSize, off); off += 4;
  buf.write("WAVE", off); off += 4;
  // fmt  sub-chunk
  buf.write("fmt ", off); off += 4;
  buf.writeUInt32LE(16, off); off += 4;          // sub-chunk size
  buf.writeUInt16LE(1, off); off += 2;           // PCM
  buf.writeUInt16LE(numChannels, off); off += 2;
  buf.writeUInt32LE(sampleRate, off); off += 4;
  buf.writeUInt32LE(byteRate, off); off += 4;
  buf.writeUInt16LE(blockAlign, off); off += 2;
  buf.writeUInt16LE(bitsPerSample, off); off += 2;
  // data sub-chunk
  buf.write("data", off); off += 4;
  buf.writeUInt32LE(dataSize, off); off += 4;
  buf.fill(0x80, off); // 0x80 = silence for unsigned 8-bit PCM
  return buf;
}

const repoRoot = resolve(import.meta.dirname, "..");
const mainEntry = join(repoRoot, "out/main/index.js");

if (!existsSync(mainEntry)) {
  console.error("smoke: out/main/index.js missing. Run `npm run build` first.");
  process.exit(2);
}

const userData = mkdtempSync(join(tmpdir(), "beatos-smoke-"));
const logsDir = join(repoRoot, "logs");
mkdirSync(logsDir, { recursive: true });
const ts = Date.now();
const logPath = join(logsDir, `smoke-${ts}.jsonl`);
const dbPath = join(userData, "smoke.db");

let exitCode = 0;
const failures = [];

const app = await electron.launch({
  args: [mainEntry, "--smoke", "--no-splash"],
  env: {
    ...process.env,
    BEATOS_DB_PATH: dbPath,
    BEATOS_LOG_PATH: logPath,
  },
  timeout: 30_000,
});

try {
  const window = await app.firstWindow({ timeout: 15_000 });
  // With --no-splash, only the main window should exist. If the splash
  // appears in smoke runs it would break firstWindow() semantics.
  const allWindows = app.windows();
  if (allWindows.length !== 1) {
    failures.push(
      `expected exactly 1 window (--no-splash), saw ${allWindows.length}`
    );
  }
  window.on("pageerror", (err) => {
    failures.push(`renderer pageerror: ${err.message}`);
  });
  await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  // Wait until React has mounted something meaningful into #root.
  await window.waitForSelector("#root > *", { timeout: 5000 });

  if (existsSync(logPath)) {
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
  } else {
    failures.push(`sidecar log file never appeared at ${logPath}`);
  }

  const screenshotPath = join(logsDir, `smoke-${ts}.png`);
  await window.screenshot({ path: screenshotPath });
  console.log(`smoke: screenshot ${screenshotPath}`);

  // React-mount sanity: WelcomeScreen should render on a fresh DB.
  const rootSize = await window.evaluate(() => document.getElementById("root")?.innerHTML?.length ?? -1);
  if (rootSize < 100) {
    failures.push(`#root content suspiciously small (${rootSize} chars) — React likely didn't mount`);
  }

  // === drag-drop / List membership / cover-asset assertions ===
  // Membership asserted end-to-end via API (deterministic). Cover asserted
  // both via API (track.cover_asset_id non-null) and DOM (img renders).
  try {
    const userDataApp = await app.evaluate(({ app }) => app.getPath("userData"));
    const handshakePath = join(userDataApp, "runtime", "handshake.json");
    if (!existsSync(handshakePath)) {
      throw new Error(`handshake missing at ${handshakePath}`);
    }
    const handshake = JSON.parse(readFileSync(handshakePath, "utf-8"));
    if (typeof handshake.port !== "number") {
      throw new Error(`handshake.port not a number: ${JSON.stringify(handshake)}`);
    }
    const baseUrl = `http://127.0.0.1:${handshake.port}`;

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

    // Seed: Source rooted at userData (writable, real dir), 2 tracks, 1 cover image, 1 List.
    await postJson("/api/sources", { root_path: userData });

    const t1 = await postJson("/api/tracks", { title: "Smoke1" });
    const t2 = await postJson("/api/tracks", { title: "Smoke2" });
    const list = await postJson("/api/lists", { name: "SmokeList" });

    // Cover asset for Smoke1: write a tiny PNG into the Source root and attach.
    const coverPath = join(userData, "smoke1-cover.png");
    writeFileSync(coverPath, TINY_PNG);
    const coverAsset = await postJson(`/api/tracks/${t1.id}/assets`, {
      role: "cover",
      path: coverPath,
    });
    if (typeof coverAsset.id !== "number") {
      throw new Error(`attach cover returned no id: ${JSON.stringify(coverAsset)}`);
    }

    // API-level: confirm cover_asset_id flows into Track responses.
    const tracksAfterSeed = await (await fetch(`${baseUrl}/api/tracks`)).json();
    const t1FromApi = tracksAfterSeed.find((t) => t.id === t1.id);
    if (!t1FromApi || t1FromApi.cover_asset_id !== coverAsset.id) {
      failures.push(
        `API: Smoke1.cover_asset_id expected ${coverAsset.id}, got ${t1FromApi?.cover_asset_id}`
      );
    } else {
      console.log("smoke: track.cover_asset_id wiring PASS");
    }

    // Force renderer to pick up the new state. After seeding, we're at #/welcome
    // (zero sources at boot). Navigate to "/" so AppShell mounts and refreshes.
    await window.evaluate(() => { location.hash = "/"; });
    await window.evaluate(() => location.reload());
    await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
    await window.waitForSelector('[role="row"]', { timeout: 5000 });

    // UI assertion: cover img actually renders inside the row.
    const row1 = window.locator('[role="row"]', { hasText: "Smoke1" }).first();
    const coverImg = row1.locator('img[src^="beatos-asset://cover/"]');
    if ((await coverImg.count()) === 0) {
      failures.push("UI: Smoke1 row has no <img src=beatos-asset://cover/...>");
    } else {
      console.log("smoke: cover img render PASS");
    }

    // Structural: drag handle should wrap just the cover, NOT the row body.
    // Bug class: if `{...listeners}` slips back onto the row, row clicks
    // (select, double-click) break. Detected by comparing widths: handle
    // should be ~40px (cover thumbnail), row should be much wider.
    const row1Handle = row1.locator('[aria-label="Drag track"]');
    if ((await row1Handle.count()) === 0) {
      failures.push("UI: drag handle for 'Smoke1' not found after seeding");
    } else {
      const handleBox = await row1Handle.boundingBox();
      const rowBox = await row1.boundingBox();
      if (handleBox && rowBox && handleBox.width > rowBox.width * 0.5) {
        failures.push(
          `UI: drag handle width (${handleBox.width}) >50% of row (${rowBox.width}) — ` +
          `listeners may have slipped onto row body, breaking row clicks`
        );
      } else {
        console.log("smoke: drag handle scoping PASS");
      }
    }

    // UI drag: one track → SmokeList via dnd-kit.
    const listTarget = window.locator("text=SmokeList").first();
    if ((await row1Handle.count()) === 0) {
      // already reported above
    } else if (!(await row1Handle.isVisible())) {
      failures.push("UI: drag handle exists in DOM but not visible (hidden/zero-size)");
    } else if ((await listTarget.count()) === 0) {
      failures.push("UI: sidebar 'SmokeList' not found after seeding");
    } else {
      // Manual mouse drive — dragTo skips intermediate positions and dnd-kit's
      // distance constraint never trips. We move in explicit steps.
      const sourceBox = await row1Handle.boundingBox();
      const targetBox = await listTarget.boundingBox();
      if (!sourceBox || !targetBox) {
        failures.push("UI: could not compute bounding boxes for drag");
      } else {
        const sx = sourceBox.x + sourceBox.width / 2;
        const sy = sourceBox.y + sourceBox.height / 2;
        const tx = targetBox.x + targetBox.width / 2;
        const ty = targetBox.y + targetBox.height / 2;
        await window.mouse.move(sx, sy);
        await window.mouse.down();
        await window.mouse.move(sx + 10, sy + 10, { steps: 5 });
        await window.mouse.move(tx, ty, { steps: 10 });
        await window.mouse.up();
      }
      // Poll the backend from Node (not the renderer) — avoids execution-context
      // destruction if the app navigates to the list view after the drop.
      const pollStart = Date.now();
      let pollResult = null;
      while (Date.now() - pollStart < 3000) {
        const r = await fetch(`${baseUrl}/api/tracks?list_id=${list.id}`);
        const arr = await r.json();
        if (Array.isArray(arr) && arr.length === 1) { pollResult = arr; break; }
        await new Promise((res) => setTimeout(res, 100));
      }
      if (pollResult === null) {
        // Re-fetch one more time to capture the actual state for the failure message.
        const final = await (await fetch(`${baseUrl}/api/tracks?list_id=${list.id}`)).json();
        failures.push(`UI drag-drop: expected 1 member after 3000ms, got ${JSON.stringify(final)}`);
      } else {
        console.log("smoke: dnd-kit UI drag PASS");
      }
    }

    // Multi-add (API-level — Playwright shift+drag is unreliable per plan §7.1)
    await fetch(`${baseUrl}/api/lists/${list.id}/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track_id: t2.id }),
    });
    const finalMembers = await (await fetch(`${baseUrl}/api/tracks?list_id=${list.id}`)).json();
    if (finalMembers.length !== 2) {
      failures.push(`list membership API: expected 2, got ${finalMembers.length}`);
    } else {
      console.log("smoke: multi-add API PASS");
    }

    // Empty-state copy on a fresh List — navigate via sidebar click
    await fetch(`${baseUrl}/api/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "EmptyList" }),
    });
    await window.evaluate(() => location.reload());
    await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
    await window.waitForSelector("text=EmptyList", { timeout: 5000 });
    const emptyTarget = window.locator("text=EmptyList").first();
    await emptyTarget.click();
    await window.waitForSelector("text=/is empty/i", { timeout: 3000 });
    const html = await window.content();
    if (!/is empty/i.test(html) || !/drag tracks from all beats/i.test(html)) {
      failures.push("UI: empty-list state copy missing 'is empty' or drag hint");
    } else {
      console.log("smoke: empty-list copy PASS");
    }

    // Double-click on a track row should open the editor route.
    // Navigate back to "/" first because the empty-list section left us at
    // a List view that may not show all tracks. Reload so the track query
    // runs fresh (hash-only nav doesn't always trigger a data re-fetch).
    await window.evaluate(() => { location.hash = "/"; });
    await window.evaluate(() => location.reload());
    await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
    await window.waitForSelector('[data-track-id]', { timeout: 5000 });
    // Extra stabilisation: wait for at least 2 rows to be visible (header + track),
    // then give React one more tick to finish rendering before we double-click.
    await window.waitForFunction(
      () => document.querySelectorAll('[data-track-id]').length >= 1,
      undefined,
      { timeout: 4000 }
    );
    await window.waitForTimeout(400);
    const firstRow = window.locator('[data-track-id]').first();
    // Double-click on the title text area to avoid the disabled play button.
    const titleSpan = firstRow.locator('[data-track-title]').first();
    await titleSpan.dblclick();
    try {
      await window.waitForSelector('[data-track-editor]', { timeout: 3000 });
      console.log("smoke: double-click → editor PASS");
    } catch (e) {
      failures.push(`UI: double-click did not open editor — ${e.message}`);
    }

    // === v0.0.9: bottom player bar + play button assertions ===

    // Seed: attach a real WAV to Smoke1 so it has has_audio=true.
    // Smoke2 remains cover-free and audio-free (has_audio=false).
    const audioPath = join(userData, "smoke1-audio.wav");
    writeFileSync(audioPath, makeTinyWav());
    const audioAsset = await postJson(`/api/tracks/${t1.id}/assets`, {
      role: "audio_tagged_wav",
      path: audioPath,
    });
    if (typeof audioAsset.id !== "number") {
      failures.push(`attach audio returned no id: ${JSON.stringify(audioAsset)}`);
    }

    // Reload so the renderer fetches updated has_audio flags.
    await window.evaluate(() => { location.hash = "/"; });
    await window.evaluate(() => location.reload());
    await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
    await window.waitForSelector('[role="row"]', { timeout: 5000 });

    // Assertion 9: bottom player bar renders within 3s of app view.
    try {
      await window.waitForSelector("[data-bottom-player]", { timeout: 3000 });
      console.log("smoke: bottom player bar renders PASS");
    } catch (e) {
      failures.push(`UI: [data-bottom-player] not found — ${e.message}`);
    }

    // Assertion 10: play button disabled on rows with no audio (Smoke2).
    {
      const noAudioBtn = window.locator('[data-has-audio="false"][data-row-play-button]').first();
      if ((await noAudioBtn.count()) > 0) {
        const disabled = await noAudioBtn.isDisabled();
        if (disabled) {
          console.log("smoke: no-audio play button disabled PASS");
        } else {
          failures.push("UI: play button for no-audio track is not disabled");
        }
      } else {
        console.log("smoke: no-audio play button disabled SKIP (no such row visible)");
      }
    }

    // Assertion 11: click play on audio row → bottom bar shows data-playing="true".
    let playbackStartedForAssertion12 = false;
    {
      const playableBtn = window.locator('[data-has-audio="true"][data-row-play-button]').first();
      if ((await playableBtn.count()) > 0) {
        await playableBtn.click();
        try {
          await window.waitForSelector('[data-bottom-player][data-playing="true"]', { timeout: 3000 });
          console.log("smoke: click play → playback starts PASS");
          playbackStartedForAssertion12 = true;
        } catch (e) {
          failures.push(`UI: [data-bottom-player][data-playing="true"] never appeared — ${e.message}`);
        }
      } else {
        console.log("smoke: click play → playback starts SKIP (no playable row visible)");
      }
    }
    // === end v0.0.9 ===

    // === v0.0.9.1: regression — resume after track ends ===
    // Bug surfaced post-v0.0.9: when a track played to natural end with
    // repeat=off, audio.ended=true and clicking play again no-op'd (Chromium
    // .play() on ended element is unreliable). Fix resets currentTime=0 first.
    // Smoke uses the 5s WAV from makeTinyWav() — wait it out, then click the
    // bottom-bar play button and assert playback resumes.
    if (playbackStartedForAssertion12) {
      try {
        // Wait for the track (5s WAV, single-track queue) to end → status="paused".
        await window.waitForSelector('[data-bottom-player][data-playing="false"]', { timeout: 8000 });
        // Click the central play/pause button in the bottom bar.
        const bottomPlayBtn = window.locator('[data-bottom-player] [data-play-button]').first();
        await bottomPlayBtn.click();
        await window.waitForSelector('[data-bottom-player][data-playing="true"]', { timeout: 3000 });
        console.log("smoke: resume after end PASS");
      } catch (e) {
        failures.push(`UI: resume after end failed — ${e.message}`);
      }
    } else {
      console.log("smoke: resume after end SKIP (prerequisite assertion 11 did not start playback)");
    }
    // === end v0.0.9.1 ===

    // === v0.0.10: Key picker round-trip ===
    // Open editor on a track (double-click already opens it in v0.0.9 smoke).
    // Then click the key picker trigger, pick a key, close, assert trigger text.
    {
      try {
        // If a track-editor view is not currently open from prior assertions, open it.
        const editor = window.locator('[data-track-editor]');
        if ((await editor.count()) === 0) {
          await window.evaluate(() => { location.hash = "/"; });
          await window.waitForSelector('[role="row"]', { timeout: 5000 });
          const rowToOpen = window.locator('[role="row"]', { hasText: "Smoke1" }).first();
          await rowToOpen.dblclick();
          await window.waitForSelector('[data-track-editor]', { timeout: 3000 });
        }
        // Click the key picker trigger
        const trigger = window.locator('[data-key-picker-trigger]').first();
        await trigger.click();
        // Wait for popover content (Flat keys default tab)
        await window.waitForSelector('text=Flat keys', { timeout: 2000 });
        // Switch to Sharp keys, pick F#, pick Minor, Close
        await window.locator('text=Sharp keys').click();
        await window.locator('button[aria-label="F#"]').click();
        await window.locator('button[aria-label="Minor"]').click();
        await window.locator('button:has-text("Close")').click();
        // Assert trigger now displays "F# minor"
        await window.waitForFunction(
          () => {
            const t = document.querySelector('[data-key-picker-trigger]');
            return t && t.textContent && t.textContent.trim() === "F# minor";
          },
          undefined,
          { timeout: 2000 }
        );
        console.log("smoke: key picker round-trip PASS");
      } catch (e) {
        failures.push(`UI: key picker round-trip — ${e.message}`);
      }
    }
    // === end v0.0.10 ===

    // === v0.0.11: filter chip add/remove + sort title round-trip ===

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

    // Setup: attach producer to t1 (Smoke1) so we can filter by it.
    // producer is now a multi-value JSON array field (v0.0.12).
    await putJson(`/api/tracks/${t1.id}`, { producer: ["smoke-producer"] });

    // Navigate to "/" to ensure the main library view is showing.
    await window.evaluate(() => { location.hash = "/"; });
    await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
    await window.waitForSelector('[data-track-id]', { timeout: 5000 });

    // Assertion 14: filter chip add/remove
    {
      try {
        // Click "+ Add filter"
        const addFilterBtn = window.locator('[data-add-filter]').first();
        await addFilterBtn.click();

        // Wait for the field list to appear (the popover content with "Producer" option)
        await window.waitForSelector('text=Producer', { timeout: 3000 });

        // Click "Producer" in the field list
        // Use the popover's field-list item (a button containing only "Producer")
        const producerOption = window.locator('button:has-text("Producer")').first();
        await producerOption.click();

        // Wait for the producer value picker (distinct values list) to appear
        // The MultiValuePicker shows a loading state then the values
        await window.waitForFunction(
          () => {
            // Look for a label containing "smoke-producer" (the checkbox item)
            const labels = Array.from(document.querySelectorAll('label'));
            return labels.some((l) => l.textContent && l.textContent.includes('smoke-producer'));
          },
          undefined,
          { timeout: 5000 }
        );

        // Toggle the checkbox for "smoke-producer"
        const smokeProducerLabel = window.locator('label', { hasText: 'smoke-producer' }).first();
        await smokeProducerLabel.click();

        // Click "Apply"
        await window.locator('button:has-text("Apply")').first().click();

        // Wait for the filter chip to appear
        await window.waitForSelector('[data-filter-chip][data-field="producers"]', { timeout: 3000 });
        console.log("smoke: filter chip appears PASS");

        // Assert visible row count is 1 (only Smoke1 has smoke-producer)
        await window.waitForFunction(
          () => document.querySelectorAll('[data-track-id]').length === 1,
          undefined,
          { timeout: 3000 }
        );
        const filteredCount = await window.evaluate(
          () => document.querySelectorAll('[data-track-id]').length
        );
        if (filteredCount !== 1) {
          failures.push(`filter chip: expected 1 visible track row, got ${filteredCount}`);
        } else {
          console.log("smoke: filter chip row count PASS");
        }

        // Click the × on the chip to remove the filter
        const chip = window.locator('[data-filter-chip][data-field="producers"]').first();
        const removeSpan = chip.locator('span[aria-label="Remove producer filter"]').first();
        await removeSpan.click();

        // Wait for chip to disappear
        await window.waitForFunction(
          () => document.querySelector('[data-filter-chip][data-field="producers"]') === null,
          undefined,
          { timeout: 3000 }
        );
        console.log("smoke: filter chip remove PASS");

        // Verify row count is back to 2
        await window.waitForFunction(
          () => document.querySelectorAll('[data-track-id]').length === 2,
          undefined,
          { timeout: 3000 }
        );
        const restoredCount = await window.evaluate(
          () => document.querySelectorAll('[data-track-id]').length
        );
        if (restoredCount !== 2) {
          failures.push(`filter chip remove: expected 2 rows restored, got ${restoredCount}`);
        } else {
          console.log("smoke: filter chip restore PASS");
        }
      } catch (e) {
        failures.push(`UI: filter chip add/remove — ${e.message}`);
      }
    }

    // Assertion 15: sort title round-trip
    {
      try {
        // We should already be on the main library view after assertion 14 cleanup.
        // Verify 2 rows are visible.
        await window.waitForSelector('[data-track-id]', { timeout: 5000 });
        await window.waitForFunction(
          () => document.querySelectorAll('[data-track-id]').length >= 2,
          undefined,
          { timeout: 5000 }
        );

        // Click the Title column header to sort ascending
        const titleHeaderBtn = window.locator('[data-column="title"]').first();
        await titleHeaderBtn.click();

        // Wait for the Zustand store update + API re-fetch + React re-render
        await window.waitForTimeout(1200);

        // Capture titles and count atomically in a single evaluate.
        // [data-track-title] is on the <span> containing the track title inside TrackRow.
        const ascResult = await window.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('[data-track-id]'));
          const titles = rows.map((el) => {
            const span = el.querySelector('[data-track-title]');
            return span ? (span.textContent ?? "").trim() : "";
          });
          return { count: rows.length, titles };
        });

        if (ascResult.count !== 2) {
          failures.push(`sort asc: expected 2 rows, got ${ascResult.count}`);
        } else if (ascResult.titles[0] > ascResult.titles[1]) {
          failures.push(`sort asc: expected ascending order, got ${JSON.stringify(ascResult.titles)}`);
        } else {
          console.log(`smoke: sort title asc PASS (${ascResult.titles.join(', ')})`);
        }

        // Click again to toggle to descending
        await titleHeaderBtn.click();
        // Wait for the re-fetch + re-render
        await window.waitForTimeout(1200);

        const descResult = await window.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('[data-track-id]'));
          const titles = rows.map((el) => {
            const span = el.querySelector('[data-track-title]');
            return span ? (span.textContent ?? "").trim() : "";
          });
          return { count: rows.length, titles };
        });

        if (descResult.count !== 2) {
          failures.push(`sort desc: expected 2 rows, got ${descResult.count}`);
        } else if (descResult.titles[0] < descResult.titles[1]) {
          failures.push(`sort desc: expected descending order, got ${JSON.stringify(descResult.titles)}`);
        } else {
          console.log(`smoke: sort title desc PASS (${descResult.titles.join(', ')})`);
        }
      } catch (e) {
        failures.push(`UI: sort title round-trip — ${e.message}`);
      }
    }

    // === end v0.0.11 ===

    // === v0.0.11.1: unsaved changes dialog + column resizer drag ===

    // Assertion 16: unsaved changes dialog → Discard
    {
      try {
        // Ensure editor is open; reuse Smoke1.
        const editor = window.locator('[data-track-editor]');
        if ((await editor.count()) === 0) {
          await window.evaluate(() => { location.hash = "/"; });
          await window.waitForSelector('[role="row"]', { timeout: 5000 });
          const rowToOpen = window.locator('[role="row"]', { hasText: "Smoke1" }).first();
          await rowToOpen.dblclick();
          await window.waitForSelector('[data-track-editor]', { timeout: 3000 });
        }

        // Dirty the form: fill the title input with a smoke-only value.
        const titleInput = window.locator('#track-title');
        await titleInput.fill('smoke-dirty-title');

        // Click "Cancel (ESC)" in the editor footer — triggers useBlocker.
        await window.locator('button:has-text("Cancel (ESC)")').first().click();

        // Dialog should appear within 2s.
        await window.waitForSelector('[data-unsaved-dialog]', { timeout: 2000 });

        // Click "Discard" — blocker.proceed() navigates back to "/".
        await window.locator('[data-unsaved-dialog] button:has-text("Discard")').first().click();

        // Wait for dialog to disappear and editor to close.
        await window.waitForFunction(
          () => !document.querySelector('[data-unsaved-dialog]'),
          undefined,
          { timeout: 3000 }
        );
        await window.waitForFunction(
          () => !document.querySelector('[data-track-editor]'),
          undefined,
          { timeout: 3000 }
        );
        console.log("smoke: unsaved changes dialog Discard PASS");
      } catch (e) {
        failures.push(`UI: unsaved changes dialog — ${e.message}`);
      }
    }

    // Assertion 17: column resizer drag (BPM column)
    {
      try {
        // Should be back at "/" after assertion 16 discard.
        await window.waitForSelector('[data-track-id]', { timeout: 5000 });

        // Measure initial BPM column width via its bounding box.
        const bpmHeader = window.locator('[data-column="bpm"]').first();
        const initialBox = await bpmHeader.boundingBox();
        if (!initialBox) throw new Error('[data-column="bpm"] not visible');
        const initialWidth = initialBox.width;

        // Locate the BPM column resizer divider.
        const resizer = window.locator('[data-column-resizer="bpm"]').first();
        const resizerBox = await resizer.boundingBox();
        if (!resizerBox) throw new Error('[data-column-resizer="bpm"] not visible');

        // Synthesize pointer events to drag 40px right.
        const cx = resizerBox.x + resizerBox.width / 2;
        const cy = resizerBox.y + resizerBox.height / 2;
        await window.mouse.move(cx, cy);
        await window.mouse.down();
        await window.mouse.move(cx + 40, cy, { steps: 5 });
        await window.mouse.up();

        // Wait a tick for React re-render.
        await window.waitForTimeout(300);

        // Re-measure BPM column width.
        const newBox = await bpmHeader.boundingBox();
        if (!newBox) throw new Error('[data-column="bpm"] disappeared after drag');
        const newWidth = newBox.width;

        // Assert new width is at least initial + 30 (10px slack for clamping).
        if (newWidth >= initialWidth + 30) {
          console.log(`smoke: column resizer drag PASS (bpm: ${Math.round(initialWidth)}px → ${Math.round(newWidth)}px)`);
        } else {
          failures.push(
            `UI: column resizer drag — expected bpm width ≥ ${initialWidth + 30}, got ${newWidth} (initial ${initialWidth})`
          );
        }
      } catch (e) {
        failures.push(`UI: column resizer drag — ${e.message}`);
      }
    }

    // === end v0.0.11.1 ===

    // === v0.0.12: chip pickers + cover drag-source ===

    // Helper: ensure the track editor is open on Smoke1.
    async function ensureEditorOpen() {
      const editor = window.locator('[data-track-editor]');
      if ((await editor.count()) > 0) return;
      await window.evaluate(() => { location.hash = "/"; });
      await window.evaluate(() => location.reload());
      await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
      await window.waitForSelector('[data-track-id]', { timeout: 5000 });
      await window.waitForFunction(
        () => document.querySelectorAll('[data-track-id]').length >= 1,
        undefined,
        { timeout: 4000 }
      );
      await window.waitForTimeout(300);
      const row = window.locator('[data-track-id]').first();
      const titleSpan = row.locator('[data-track-title]').first();
      await titleSpan.dblclick();
      await window.waitForSelector('[data-track-editor]', { timeout: 3000 });
    }

    // Assertion 18: Genre chip select
    {
      try {
        await ensureEditorOpen();

        // Locate Genre picker
        const genreField = window.locator('[data-field="genre"]');
        const addBtn = genreField.locator('[data-add-button]').first();
        await addBtn.click();

        // Wait for popover to render — look for genre option text
        await window.waitForFunction(
          () => {
            const labels = Array.from(document.querySelectorAll('label'));
            return labels.some((l) => l.textContent && l.textContent.includes('流行 (Pop)'));
          },
          undefined,
          { timeout: 3000 }
        );

        // Click checkbox for 流行 (Pop)
        const popLabel = window.locator('label', { hasText: '流行 (Pop)' }).first();
        await popLabel.click();

        // Click Apply
        await window.locator('button:has-text("Apply")').first().click();

        // Verify chip with "流行 (Pop)" appears in Genre field
        await window.waitForFunction(
          () => {
            const field = document.querySelector('[data-field="genre"]');
            return field && field.textContent && field.textContent.includes('流行 (Pop)');
          },
          undefined,
          { timeout: 3000 }
        );
        console.log("smoke: genre chip select (流行/Pop) PASS");
      } catch (e) {
        failures.push(`UI: genre chip select — ${e.message}`);
      }
    }

    // Assertion 19: Producer custom add + persist verification
    {
      try {
        await ensureEditorOpen();

        // Locate Producer picker
        const producerField = window.locator('[data-field="producer"]');
        const addBtn = producerField.locator('[data-add-button]').first();
        await addBtn.click();

        // Wait for popover with custom-add input (placeholder: "Type to add…")
        await window.waitForSelector('input[placeholder="Type to add…"]', { timeout: 3000 });

        // Type a custom producer name
        const customInput = window.locator('input[placeholder="Type to add…"]').first();
        await customInput.fill('smoke-custom-producer');

        // Click the inner "Add" button (aria-label="Add custom value")
        await window.locator('button[aria-label="Add custom value"]').first().click();

        // Click Apply
        await window.locator('button:has-text("Apply")').first().click();

        // Verify chip with "smoke-custom-producer" appears in Producer field
        await window.waitForFunction(
          () => {
            const field = document.querySelector('[data-field="producer"]');
            return field && field.textContent && field.textContent.includes('smoke-custom-producer');
          },
          undefined,
          { timeout: 3000 }
        );
        console.log("smoke: producer custom chip PASS");

        // Save the track so the producer value is persisted to the sidecar.
        await window.locator('button[type="submit"]').first().click();
        // After save, navigate back to "/" (saveTrack sets navigateAfterSave)
        await window.waitForFunction(
          () => !document.querySelector('[data-track-editor]'),
          undefined,
          { timeout: 5000 }
        );

        // Verify via sidecar API
        const distinctRes = await fetch(`${baseUrl}/api/tracks/distinct/producer`);
        const distinctVals = await distinctRes.json();
        if (Array.isArray(distinctVals) && distinctVals.includes('smoke-custom-producer')) {
          console.log("smoke: producer distinct API includes smoke-custom-producer PASS");
        } else {
          failures.push(`API: distinct/producer missing 'smoke-custom-producer'; got ${JSON.stringify(distinctVals)}`);
        }
      } catch (e) {
        failures.push(`UI: producer custom add — ${e.message}`);
      }
    }

    // Assertion 20: Cover drag-source attribute
    {
      try {
        await ensureEditorOpen();

        // Query for cover drag source — Smoke1 has a cover attached earlier
        const dragSources = window.locator('[data-cover-drag-source]');
        const count = await dragSources.count();
        if (count !== 1) {
          failures.push(`UI: expected 1 [data-cover-drag-source], found ${count}`);
        } else {
          // Verify draggable="true" attribute
          const draggable = await dragSources.first().getAttribute('draggable');
          if (draggable === 'true') {
            console.log("smoke: cover drag-source draggable=true PASS");
          } else {
            failures.push(`UI: [data-cover-drag-source] draggable="${draggable}", expected "true"`);
          }
        }
      } catch (e) {
        failures.push(`UI: cover drag-source attribute — ${e.message}`);
      }
    }

    // === end v0.0.12 ===

  } catch (err) {
    failures.push(`drag-drop assertion section error: ${err.message}`);
  }
  // === end v0.0.6 ===

  if (failures.length === 0) {
    console.log("smoke: PASS");
  } else {
    exitCode = 1;
    console.error("smoke: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
  }
} catch (err) {
  exitCode = 1;
  console.error("smoke: harness error:", err.message);
} finally {
  await app.close();
  if (process.argv.includes("--keep-userdata")) {
    console.log(`smoke: userData kept at ${userData}`);
  } else {
    try {
      await fsPromises.rm(userData, { recursive: true, force: true });
      console.log(`smoke: userData cleaned at ${userData}`);
    } catch (e) {
      console.warn(`smoke: failed to clean userData ${userData}: ${e.message}`);
    }
  }
}

process.exit(exitCode);
