#!/usr/bin/env node
/**
 * One-off diagnostic: measure rendered widths of each column in the
 * TableHeader vs the first TrackRow. Reveals header/row desync.
 */
import { _electron as electron } from "playwright";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, promises as fsPromises } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = resolve(import.meta.dirname, "..");
const mainEntry = join(repoRoot, "out/main/index.js");
if (!existsSync(mainEntry)) {
  console.error("inspect: out/main/index.js missing. Run `npm run build` first.");
  process.exit(2);
}

const userData = mkdtempSync(join(tmpdir(), "beatos-inspect-"));
const logsDir = join(repoRoot, "logs");
mkdirSync(logsDir, { recursive: true });
const dbPath = join(userData, "inspect.db");

const app = await electron.launch({
  args: [mainEntry, "--no-splash"],
  env: {
    ...process.env,
    BEATOS_DB_PATH: dbPath,
    BEATOS_LOG_PATH: join(logsDir, "inspect.log"),
    BEATOS_HEADLESS: "1",
    BEATOS_AUDIO_MUTED: "1",
  },
  timeout: 30_000,
});

try {
  const window = await app.firstWindow({ timeout: 15_000 });
  await window.waitForLoadState("domcontentloaded");

  const udPath = await app.evaluate(({ app }) => app.getPath("userData"));
  const handshakePath = join(udPath, "runtime", "handshake.json");
  await new Promise((r) => setTimeout(r, 1500));
  const hs = JSON.parse(readFileSync(handshakePath, "utf8"));
  const baseUrl = `http://127.0.0.1:${hs.port}`;

  async function postJson(path, body) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  await postJson("/api/sources", { root_path: userData });
  await postJson("/api/tracks", { title: "Inspect1" });
  await postJson("/api/tracks", { title: "Inspect2" });

  await window.evaluate(() => { window.location.hash = "#/"; });
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await window.evaluate(() => { window.location.hash = "#/"; });
  // Ensure preview panel open at default width to mirror the user's screenshot.
  await window.evaluate(() => {
    sessionStorage.setItem(
      "beatos.previewPanel.v1",
      JSON.stringify({ open: true, width: 380 }),
    );
  });
  await window.reload();
  await window.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 800));

  const dims = await window.evaluate(() => {
    function geom(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), width: Math.round(r.width), right: Math.round(r.right) };
    }
    const header = document.querySelector('[role="row"]');
    const headerBtns = header
      ? [...header.children].map((c) => ({ tag: c.tagName, label: c.getAttribute("data-column") ?? c.textContent?.trim().slice(0, 12) ?? "?", ...geom(c) }))
      : null;
    const row = document.querySelector("[data-track-id]");
    const rowCells = row
      ? [...row.children].map((c) => ({ tag: c.tagName, label: c.textContent?.trim().slice(0, 12) ?? "?", ...geom(c) }))
      : null;
    const section = document.querySelector("[data-library-drop-target]");
    return {
      sectionRect: geom(section),
      headerRect: geom(header),
      rowRect: geom(row),
      headerBtns,
      rowCells,
    };
  });

  console.log("\nSection: ", dims.sectionRect);
  console.log("Header:  ", dims.headerRect);
  console.log("Row:     ", dims.rowRect);
  console.log("\nHeader children:");
  for (const b of dims.headerBtns ?? []) console.log(`  ${b.tag.padEnd(7)} ${String(b.label).padEnd(14)} left=${b.left}  width=${b.width}  right=${b.right}`);
  console.log("\nRow children:");
  for (const c of dims.rowCells ?? []) console.log(`  ${c.tag.padEnd(7)} ${String(c.label).padEnd(14)} left=${c.left}  width=${c.width}  right=${c.right}`);
} finally {
  await app.close();
  try {
    await fsPromises.rm(userData, { recursive: true, force: true });
  } catch {}
}
