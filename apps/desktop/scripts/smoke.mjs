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
import { existsSync, readFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

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
    const errors = lines
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((e) => e && e.level === "error");
    if (errors.length > 0) {
      failures.push(`sidecar emitted ${errors.length} error(s); first: ${JSON.stringify(errors[0])}`);
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

  // === v0.0.6 drag-drop / List membership API assertion ===
  // We assert membership end-to-end via API calls (deterministic), with a
  // single dragTo() check to verify the dnd-kit wiring actually works.
  try {
    const userDataApp = await app.evaluate(({ app }) => app.getPath("userData"));
    const handshakePath = join(userDataApp, "runtime", "handshake.json");
    if (!existsSync(handshakePath)) {
      throw new Error(`handshake missing at ${handshakePath}`);
    }
    const port = JSON.parse(readFileSync(handshakePath, "utf-8")).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Seed: a Source rooted at userData (writable, real dir), 2 tracks, 1 List.
    const srcRes = await fetch(`${baseUrl}/api/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root_path: userData }),
    });
    if (!srcRes.ok) throw new Error(`POST /api/sources -> ${srcRes.status}`);

    await fetch(`${baseUrl}/api/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Smoke1" }),
    });
    const t2 = await (await fetch(`${baseUrl}/api/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Smoke2" }),
    })).json();
    const list = await (await fetch(`${baseUrl}/api/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "SmokeList" }),
    })).json();

    // Force renderer to pick up the new state. After seeding, we're at #/welcome
    // (zero sources at boot). Navigate to "/" so AppShell mounts and refreshes.
    await window.evaluate(() => { location.hash = "/"; });
    await window.evaluate(() => location.reload());
    await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
    await window.waitForTimeout(2500);


    // UI drag: one track → SmokeList via dnd-kit
    // Drag handle is the cover thumbnail (aria-label="Drag track"), NOT the
    // row body — row body needs clean clicks for select/double-click.
    const row1 = window.locator('[role="row"]', { hasText: "Smoke1" }).first();
    const row1Handle = row1.locator('[aria-label="Drag track"]');
    const listTarget = window.locator("text=SmokeList").first();
    if ((await row1Handle.count()) === 0) {
      failures.push("UI: drag handle for 'Smoke1' not found after seeding");
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
