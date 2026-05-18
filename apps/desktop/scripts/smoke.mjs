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
 * - 30+ feature assertions (see scripts/smoke/runner.mjs for the full ordered list)
 *
 * Outputs: screenshot at logs/smoke-<ts>.png (always — useful when failures occur)
 *
 * Exit codes: 0 PASS, 1 FAIL, 2 prereq missing
 */
import { promises as fsPromises } from "node:fs";

import { TINY_PNG, makeTinyWav, makeDawStyleWav } from "./smoke/fixtures.mjs";
import {
  bootstrapPaths,
  launchApp,
  checkSidecarLog,
  readHandshakeBaseUrl,
  makeApi,
} from "./smoke/setup.mjs";
import { runAssertions } from "./smoke/runner.mjs";

const { mainEntry, userData, logPath, dbPath, screenshotPath } =
  bootstrapPaths(import.meta.dirname);

let exitCode = 0;
const failures = [];
const rendererConsole = [];

const app = await launchApp({ mainEntry, dbPath, logPath });

try {
  const window = await app.firstWindow({ timeout: 15_000 });
  // With --no-splash, only the main window should exist. If the splash
  // appears in smoke runs it would break firstWindow() semantics.
  const allWindows = app.windows();
  if (allWindows.length !== 1) {
    failures.push(
      `expected exactly 1 window (--no-splash), saw ${allWindows.length}`,
    );
  }
  window.on("pageerror", (err) => {
    failures.push(`renderer pageerror: ${err.message}`);
  });
  // Surface renderer console.error/warn lines so audio-engine failures show up
  // in the smoke output without manual DevTools spelunking.
  window.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      rendererConsole.push(`[${type}] ${msg.text()}`);
    }
  });
  await window.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  // Wait until React has mounted something meaningful into #root.
  await window.waitForSelector("#root > *", { timeout: 5000 });

  // Sidecar log assertions.
  failures.push(...checkSidecarLog(logPath));

  await window.screenshot({ path: screenshotPath });
  console.log(`smoke: screenshot ${screenshotPath}`);

  // React-mount sanity: WelcomeScreen should render on a fresh DB.
  const rootSize = await window.evaluate(() => document.getElementById("root")?.innerHTML?.length ?? -1);
  if (rootSize < 100) {
    failures.push(`#root content suspiciously small (${rootSize} chars) — React likely didn't mount`);
  }

  try {
    const userDataApp = await app.evaluate(({ app }) => app.getPath("userData"));
    const baseUrl = readHandshakeBaseUrl(userDataApp);
    const { postJson, putJson } = makeApi(baseUrl);

    const ctx = {
      app,
      window,
      userData,
      baseUrl,
      TINY_PNG,
      makeTinyWav,
      makeDawStyleWav,
      postJson,
      putJson,
      failures,
      rendererConsole,
      fixtures: {},
      flags: { playbackStarted: false },
    };

    await runAssertions(ctx);
  } catch (err) {
    failures.push(`assertion section error: ${err.message}`);
  }

  if (failures.length === 0) {
    console.log("smoke: PASS");
  } else {
    exitCode = 1;
    console.error("smoke: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    if (rendererConsole.length > 0) {
      console.error("smoke: renderer console (last 20 lines):");
      for (const line of rendererConsole.slice(-20)) console.error(`  ${line}`);
    }
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
