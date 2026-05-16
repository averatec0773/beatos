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
