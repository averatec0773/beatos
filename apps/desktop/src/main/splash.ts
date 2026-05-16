import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { is } from "@electron-toolkit/utils";

export const SPLASH_MIN_DISPLAY_MS = 600;

const SPLASH_WIDTH = 480;
const SPLASH_HEIGHT = 320;

/** Pure: command-line flag check. Exposed for unit testing. */
export function shouldShowSplash(argv: readonly string[]): boolean {
  return !argv.includes("--no-splash");
}

/** Pure: how long to keep splash up before closing. Exposed for unit testing. */
export function closeDelayMs(shownAt: number, now: number): number {
  const elapsed = now - shownAt;
  if (elapsed >= SPLASH_MIN_DISPLAY_MS) return 0;
  return Math.max(0, SPLASH_MIN_DISPLAY_MS - elapsed);
}

function iconPath(): string {
  if (is.dev) {
    return join(app.getAppPath(), "resources", "icon.png");
  }
  return join(process.resourcesPath, "icon.png");
}

function iconDataUri(): string {
  const p = iconPath();
  if (!existsSync(p)) {
    throw new Error(
      `Splash icon not found at ${p}. ` +
        `Dev expects apps/desktop/resources/icon.png; ` +
        `prod expects extraResources to copy it to process.resourcesPath.`
    );
  }
  const b64 = readFileSync(p).toString("base64");
  return `data:image/png;base64,${b64}`;
}

function splashHtml(): string {
  const icon = iconDataUri();
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden;
    background: transparent; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .root {
    height: 100%; width: 100%;
    background: #121212;
    border-radius: 12px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 16px;
    user-select: none; -webkit-user-select: none;
  }
  .logo { width: 96px; height: 96px; }
  .title { color: #ffffff; font-size: 24px; font-weight: 600; }
  .credit { color: #7c5cff; font-size: 13px; font-weight: 400; }
  .dots { display: flex; gap: 6px; margin-top: 4px; }
  .dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #7c5cff; opacity: 0.3;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
</style>
</head>
<body>
<div class="root">
  <img class="logo" src="${icon}" alt="BeatOS">
  <div class="title">BeatOS</div>
  <div class="credit">by averatec0773</div>
  <div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
</div>
</body>
</html>`;
}

/**
 * Create the splash window. Returns null when --no-splash flag is present so
 * smoke runs can use `firstWindow()` semantics on the main window.
 */
export function createSplashWindow(argv: readonly string[]): BrowserWindow | null {
  if (!shouldShowSplash(argv)) return null;

  let htmlContent: string;
  try {
    htmlContent = splashHtml();
  } catch (e) {
    console.warn("[splash] failed to build HTML, skipping splash:", e);
    return null;
  }

  const splash = new BrowserWindow({
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    hasShadow: true,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splash.once("ready-to-show", () => splash.show());
  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  return splash;
}

/**
 * Coordinate splash close + main show. Honors a 600ms minimum-display floor so
 * splash never flashes faster than the eye can register the logo.
 */
export function closeSplashAndShowMain(
  splash: BrowserWindow | null,
  mainWin: BrowserWindow,
  shownAt: number
): void {
  if (!splash || splash.isDestroyed()) {
    mainWin.show();
    return;
  }
  const delay = closeDelayMs(shownAt, Date.now());
  if (delay === 0) {
    mainWin.show();
    splash.close();
    return;
  }
  setTimeout(() => {
    mainWin.show();
    if (!splash.isDestroyed()) splash.close();
  }, delay);
}
