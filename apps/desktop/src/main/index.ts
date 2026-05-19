import { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, shell } from "electron";
import { join, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { spawn, ChildProcess } from "node:child_process";
import readline from "node:readline";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";

import { readConfig, writeConfig } from "./config";
import { configureLogger, logger } from "./logger";
import { handleAssetRequest } from "./asset-protocol";
import { parseUvicornLevel } from "./log-parse";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { assertSidecarLayout } from "./sidecar-helpers";
import { createSplashWindow, closeSplashAndShowMain } from "./splash";
import { testMcpConnection } from "./mcp/test-connection";

const HANDSHAKE_TIMEOUT_MS = 5000;
const HANDSHAKE_POLL_MS = 50;
const SIDECAR_KILL_GRACE_MS = 3000;

let sidecar: ChildProcess | null = null;
let apiPort: number | null = null;
let splashWin: BrowserWindow | null = null;
let splashShownAt = 0;

// Register the beatos-asset:// scheme as privileged so the renderer can
// load cover images via <img src="beatos-asset://cover/123"> AND audio
// buffers via Web Audio's fetch + decodeAudioData (Tone.js). corsEnabled is
// required because the renderer's origin is file:// — without it, fetch()
// from file:// to a custom scheme is rejected as a cross-origin request.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "beatos-asset",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: false,
      stream: true,
    },
  },
]);

function handshakePath(): string {
  return join(app.getPath("userData"), "runtime", "handshake.json");
}

function ensureRuntimeDir(): void {
  const dir = join(app.getPath("userData"), "runtime");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function clearStaleHandshake(hp: string): void {
  try {
    unlinkSync(hp);
  } catch {
    // fine if it doesn't exist
  }
}

function repoRoot(): string {
  // out/main/index.js → repo root (4 levels up: main → out → desktop → apps → root)
  return join(__dirname, "..", "..", "..", "..");
}

function resolveDbPath(): string {
  return (
    process.env.BEATOS_DB_PATH ??
    readConfig().dbPath ??
    join(app.getPath("music"), "BeatOS", "global.db")
  );
}

function resolveLogsDir(): string {
  if (is.dev) {
    return join(app.getAppPath(), "logs");
  }
  return join(app.getPath("logs"), "BeatOS");
}

function startSidecar(): void {
  ensureRuntimeDir();
  const hp = handshakePath();
  clearStaleHandshake(hp);

  assertSidecarLayout(repoRoot(), __dirname);

  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const logsDir = resolveLogsDir();
  mkdirSync(logsDir, { recursive: true });
  const sidecarLogPath = process.env.BEATOS_LOG_PATH ?? join(logsDir, "sidecar.jsonl");
  mkdirSync(dirname(sidecarLogPath), { recursive: true });

  sidecar = spawn("uv", ["run", "python", "-m", "beatos_http"], {
    cwd: repoRoot(),
    env: {
      ...process.env,
      BEATOS_HANDSHAKE_PATH: hp,
      BEATOS_DB_PATH: dbPath,
      BEATOS_LOG_PATH: sidecarLogPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const tagStream = (stream: NodeJS.ReadableStream, fallback: "info" | "error"): void => {
    const rl = readline.createInterface({ input: stream });
    rl.on("line", (line) => {
      const level = parseUvicornLevel(line, fallback);
      logger[level](`[sidecar] ${line}`);
    });
  };
  if (sidecar.stdout) tagStream(sidecar.stdout, "info");
  if (sidecar.stderr) tagStream(sidecar.stderr, "error");

  sidecar.on("exit", (code, signal) => {
    logger.warn(`[sidecar] process exited code=${code} signal=${signal}`);
    apiPort = null;
    sidecar = null;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.SIDECAR_CRASHED, { code, signal });
    }
  });
}

async function waitForHandshake(): Promise<number> {
  const hp = handshakePath();
  const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (existsSync(hp)) {
      try {
        const data = JSON.parse(readFileSync(hp, "utf8"));
        if (typeof data.port === "number") return data.port;
      } catch {
        // file may be mid-write
      }
    }
    await new Promise((r) => setTimeout(r, HANDSHAKE_POLL_MS));
  }
  throw new Error(`Sidecar handshake not seen at ${hp} within ${HANDSHAKE_TIMEOUT_MS}ms`);
}

function stopSidecar(): void {
  if (!sidecar) return;
  const child = sidecar;
  sidecar = null;
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, SIDECAR_KILL_GRACE_MS);
  child.once("exit", () => clearTimeout(killTimer));
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 18 } : undefined,
    backgroundColor: "#121212",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      // sandbox: false required for ipcRenderer in preload.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      // BeatOS is an audio app — Chromium's default `backgroundThrottling`
      // suspends timers / audio decoding when the window loses focus (e.g.
      // user switches to VS Code on another monitor). That causes playback
      // to stall mid-track. Keep the renderer at full priority always.
      backgroundThrottling: false,
    },
  });

  win.on("ready-to-show", () => {
    closeSplashAndShowMain(splashWin, win, splashShownAt);
    splashWin = null;
  });
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  configureLogger();
  logger.info("[main] electron app ready");

  // Splash is created BEFORE IPC handlers / protocol / sidecar so it's visible
  // during the ~1-5s boot. Splash window has no preload + no nodeIntegration +
  // sandbox:true — it MUST NOT depend on any IPC, since handlers below this
  // point haven't been registered yet.
  splashWin = createSplashWindow(process.argv);
  if (splashWin) {
    // Set fallback timestamp at create time so the 600ms floor is enforced
    // even if main's ready-to-show fires before splash's. Refined below.
    splashShownAt = Date.now();
    splashWin.once("ready-to-show", () => {
      splashShownAt = Date.now();
      logger.info(`[splash] visible at ${new Date(splashShownAt).toISOString()}`);
    });
  }

  electronApp.setAppUserModelId("studio.averatec.beatos");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.handle(IPC_CHANNELS.GET_API_BASE, () => {
    if (apiPort == null) throw new Error("API not ready");
    return `http://127.0.0.1:${apiPort}`;
  });

  ipcMain.on(IPC_CHANNELS.DRAG_OUT_FILE, (event, payload: { absPath: string }) => {
    const p = payload?.absPath;
    if (typeof p !== "string") {
      console.warn("[drag-out] non-string path");
      return;
    }
    const isAbsolute = process.platform === "win32"
      ? /^[a-zA-Z]:[\\\/]/.test(p)
      : p.startsWith("/");
    if (!isAbsolute || p.includes("..")) {
      console.warn("[drag-out] rejected unsafe path:", p);
      return;
    }
    if (!existsSync(p)) {
      console.warn("[drag-out] file missing:", p);
      return;
    }
    let icon = nativeImage.createEmpty();
    try {
      const created = nativeImage.createFromPath(p).resize({ width: 64 });
      if (!created.isEmpty()) icon = created;
    } catch {
      // keep empty icon
    }
    event.sender.startDrag({ file: p, icon });
  });

  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Choose Library Folder",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.APP_QUIT, () => app.quit());

  ipcMain.handle(IPC_CHANNELS.PATH_HOME, () => app.getPath("home"));

  ipcMain.handle(IPC_CHANNELS.PATH_ENSURE_DIR, (_e, dirPath: string) => {
    mkdirSync(dirPath, { recursive: true });
    return dirPath;
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_GET_DB_PATH, () => resolveDbPath());

  ipcMain.handle(IPC_CHANNELS.STORAGE_GET_REPO_ROOT, () => repoRoot());

  ipcMain.handle(IPC_CHANNELS.MCP_TEST_CONNECTION, () =>
    testMcpConnection({ repoRoot: repoRoot(), dbPath: resolveDbPath() })
  );

  ipcMain.handle(IPC_CHANNELS.STORAGE_SET_DB_PATH, (_e, newPath: string) => {
    mkdirSync(dirname(newPath), { recursive: true });
    writeConfig({ dbPath: newPath });
    return { restartRequired: true };
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(
    IPC_CHANNELS.DIALOG_OPEN_FILE,
    async (_e, filters: { name: string; extensions: string[] }[]) => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters,
        title: "Choose File",
      });
      return result.canceled ? null : result.filePaths[0];
    }
  );

  ipcMain.handle(IPC_CHANNELS.SHELL_REVEAL_IN_FINDER, (_e, path: string) => {
    shell.showItemInFolder(path);
  });

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`Refused to open non-http(s) URL: ${url}`);
    }
    shell.openExternal(url);
  });

  protocol.handle("beatos-asset", (request) =>
    handleAssetRequest(request, { apiPort: () => apiPort })
  );

  try {
    startSidecar();
    apiPort = await waitForHandshake();
    createWindow();
  } catch (err) {
    logger.error(`[main] bootstrap failed: ${err instanceof Error ? err.message : String(err)}`);
    if (splashWin && !splashWin.isDestroyed()) {
      splashWin.close();
      splashWin = null;
    }
    dialog.showErrorBox(
      "BeatOS could not start",
      err instanceof Error ? err.message : String(err)
    );
    app.quit();
    return;
  }

  // No splash on macOS dock-icon reopen — intentional (user just hid the app).
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopSidecar();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopSidecar();
});
