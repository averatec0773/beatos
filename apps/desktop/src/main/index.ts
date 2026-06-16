import { app, BrowserWindow, dialog, ipcMain, nativeImage, protocol, shell } from "electron";
import { join, dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { spawn, ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import readline from "node:readline";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";

import { readConfig, writeConfig } from "./config";
import { configureLogger, logger } from "./logger";
import { handleAssetRequest } from "./asset-protocol";
import { isSafeAbsolutePath } from "./path-safety";
import { parseUvicornLevel } from "./log-parse";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { assertSidecarLayout } from "./sidecar-helpers";
import { createSplashWindow, closeSplashAndShowMain } from "./splash";
import { testMcpConnection } from "./mcp/test-connection";
import { installMcpClientConfig, type McpClientTarget } from "./mcp/install-config";

// Cold starts after a pull (uv resolving a changed lockfile before uvicorn even
// boots) can legitimately exceed 5s; the splash covers the wait, so be patient.
const HANDSHAKE_TIMEOUT_MS = 15000;
const HANDSHAKE_POLL_MS = 50;
const SIDECAR_KILL_GRACE_MS = 3000;

let sidecar: ChildProcess | null = null;
let apiPort: number | null = null;
// Per-process local token gating the agent-control /api endpoints (permission
// mode + token approve/reject). Passed to the sidecar and handed to the renderer
// via the preload bridge; a file:// page the user opens can't reach the bridge,
// so it can't forge these requests. See beatos_http/api_auth.py.
const apiToken = randomBytes(32).toString("hex");
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

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BEATOS_HANDSHAKE_PATH: hp,
    BEATOS_DB_PATH: dbPath,
    BEATOS_LOG_PATH: sidecarLogPath,
    BEATOS_API_TOKEN: apiToken,
    // The desktop app uses native dialogs, never /api/fs — disable that route so
    // a file:// page can't read the disk / launch files through it.
    BEATOS_DISABLE_FS_API: "1",
  };
  // GUI launches (macOS Dock / a packaged app) inherit a minimal PATH that
  // often lacks uv's default install dir (~/.local/bin) and Homebrew, so
  // spawning "uv" fails with ENOENT. Prepend the common locations on POSIX.
  // Windows installs uv onto the user PATH already, so leave it untouched there.
  if (process.platform !== "win32") {
    const extra = [`${process.env.HOME}/.local/bin`, "/opt/homebrew/bin", "/usr/local/bin"];
    env.PATH = [...extra, process.env.PATH ?? ""].filter(Boolean).join(":");
  }

  sidecar = spawn("uv", ["run", "python", "-m", "beatos_http"], {
    cwd: repoRoot(),
    env,
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
    // `child.killed` only means a signal was *sent*, not that the process died,
    // so it's true immediately after SIGTERM and would gate out the SIGKILL.
    // Check the real exit state instead, so a sidecar that ignores/hangs on
    // SIGTERM still gets force-killed (no orphan uvicorn).
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, SIDECAR_KILL_GRACE_MS);
  child.once("exit", () => clearTimeout(killTimer));
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // Below this the fixed-width sidebar + detail rails squeeze the middle
    // table toward zero (no responsive collapse yet), so floor the window.
    minWidth: 900,
    minHeight: 600,
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

  ipcMain.handle(IPC_CHANNELS.GET_API_TOKEN, () => apiToken);

  ipcMain.on(IPC_CHANNELS.DRAG_OUT_FILE, (event, payload: { absPath: string }) => {
    const p = payload?.absPath;
    if (!isSafeAbsolutePath(p)) {
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
    if (!isSafeAbsolutePath(dirPath)) throw new Error("unsafe path");
    mkdirSync(dirPath, { recursive: true });
    return dirPath;
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_GET_DB_PATH, () => resolveDbPath());

  ipcMain.handle(IPC_CHANNELS.STORAGE_GET_REPO_ROOT, () => repoRoot());

  ipcMain.handle(IPC_CHANNELS.MCP_TEST_CONNECTION, () =>
    testMcpConnection({ repoRoot: repoRoot() }),
  );

  ipcMain.handle(IPC_CHANNELS.MCP_INSTALL_CLIENT_CONFIG, (_e, target: McpClientTarget) =>
    installMcpClientConfig({
      target,
      repoRoot: repoRoot(),
      homeDir: app.getPath("home"),
      platform: process.platform,
      appData: process.env.APPDATA,
    }),
  );

  ipcMain.handle(IPC_CHANNELS.STORAGE_SET_DB_PATH, (_e, newPath: string) => {
    if (!isSafeAbsolutePath(newPath)) throw new Error("unsafe path");
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
    },
  );

  ipcMain.handle(IPC_CHANNELS.SHELL_REVEAL_IN_FINDER, (_e, path: string) => {
    shell.showItemInFolder(path);
  });

  // Open a folder/file in its default OS handler (Finder for a directory).
  // Returns "" on success or an error string (shell.openPath contract) so the
  // renderer can surface a missing/moved project folder.
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, (_e, path: string) => shell.openPath(path));

  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`Refused to open non-http(s) URL: ${url}`);
    }
    shell.openExternal(url);
  });

  protocol.handle("beatos-asset", (request) =>
    handleAssetRequest(request, { apiPort: () => apiPort }),
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
    dialog.showErrorBox("BeatOS could not start", err instanceof Error ? err.message : String(err));
    app.quit();
    return;
  }

  // No splash on macOS dock-icon reopen — intentional (user just hid the app).
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    // The sidecar may have stopped/crashed while the app had no windows. Bring
    // it back before opening a window — otherwise the new window is a dead shell
    // (apiPort is null, so every request fails with no in-app way to recover).
    if (sidecar == null) {
      try {
        startSidecar();
        apiPort = await waitForHandshake();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[main] sidecar restart on activate failed: ${msg}`);
        dialog.showErrorBox("BeatOS could not restart", msg);
        return;
      }
    }
    createWindow();
  });
});

app.on("window-all-closed", () => {
  // macOS keeps the app (and its sidecar) alive when the last window closes so
  // the dock icon reopens a working window; before-quit stops the sidecar on a
  // real quit. Other platforms quit with the last window.
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopSidecar();
});
