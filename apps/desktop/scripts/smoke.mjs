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
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
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
  args: [mainEntry, "--smoke"],
  env: {
    ...process.env,
    BEATOS_DB_PATH: dbPath,
    BEATOS_LOG_PATH: logPath,
  },
  timeout: 30_000,
});

try {
  const window = await app.firstWindow({ timeout: 15_000 });
  window.on("pageerror", (err) => {
    failures.push(`renderer pageerror: ${err.message}`);
  });
  await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });

  await window.waitForTimeout(2000);

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
    await window.waitForTimeout(2500);


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
      await window.waitForTimeout(800);
      const members = await (await fetch(`${baseUrl}/api/tracks?list_id=${list.id}`)).json();
      if (!Array.isArray(members) || members.length !== 1) {
        failures.push(`UI drag-drop: expected 1 member, got ${JSON.stringify(members)}`);
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
    await window.waitForTimeout(1500);
    const emptyTarget = window.locator("text=EmptyList").first();
    if ((await emptyTarget.count()) === 0) {
      failures.push("UI: 'EmptyList' not found in sidebar after refresh");
    } else {
      await emptyTarget.click();
      await window.waitForTimeout(800);
      const html = await window.content();
      if (!/is empty/i.test(html) || !/drag tracks from all beats/i.test(html)) {
        failures.push("UI: empty-list state copy missing 'is empty' or drag hint");
      } else {
        console.log("smoke: empty-list copy PASS");
      }
    }
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
  console.log(`smoke: userData kept at ${userData} for inspection`);
}

process.exit(exitCode);
