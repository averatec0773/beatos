import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from "electron";
import { join, dirname, basename } from "node:path";
import { existsSync, mkdirSync, readFileSync, unlinkSync, promises as fsPromises } from "node:fs";
import { spawn, ChildProcess } from "node:child_process";
import readline from "node:readline";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";

import { readConfig, writeConfig } from "./config";
import { configureLogger, logger } from "./logger";
import { parseUvicornLevel } from "./log-parse";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { assertSidecarLayout } from "./sidecar-helpers";
import { createSplashWindow, closeSplashAndShowMain } from "./splash";

const HANDSHAKE_TIMEOUT_MS = 5000;
const HANDSHAKE_POLL_MS = 50;
const SIDECAR_KILL_GRACE_MS = 3000;

let sidecar: ChildProcess | null = null;
let apiPort: number | null = null;
let splashWin: BrowserWindow | null = null;
let splashShownAt = 0;

// Register the beatos-asset:// scheme as privileged so the renderer can
// load cover images via <img src="beatos-asset://cover/123">. file:// is
// CSP-blocked from the renderer for security; a custom scheme is the
// supported workaround.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "beatos-asset",
    privileges: {
      secure: true,
      supportFetchAPI: true,
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
    backgroundColor: "#121212",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      // sandbox: false required for ipcRenderer in preload.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
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
    IPC_CHANNELS.FS_COPY_INTO_SOURCE,
    async (_e, src: string, destSourceRoot: string, subfolder: string | null) => {
      const targetDir = subfolder ? join(destSourceRoot, subfolder) : destSourceRoot;
      mkdirSync(targetDir, { recursive: true });
      const dest = join(targetDir, basename(src));
      await fsPromises.copyFile(src, dest);
      return dest;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.FS_MOVE_INTO_SOURCE,
    async (_e, src: string, destSourceRoot: string, subfolder: string | null) => {
      const targetDir = subfolder ? join(destSourceRoot, subfolder) : destSourceRoot;
      mkdirSync(targetDir, { recursive: true });
      const dest = join(targetDir, basename(src));
      await fsPromises.rename(src, dest);
      return dest;
    }
  );

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

  protocol.handle("beatos-asset", async (request) => {
    // URL shape: beatos-asset://cover/<asset_id>
    try {
      const url = new URL(request.url);
      if (url.host !== "cover") return new Response(null, { status: 404 });
      const assetId = url.pathname.replace(/^\//, "");
      if (apiPort == null) return new Response(null, { status: 503 });
      const upstream = await fetch(`http://127.0.0.1:${apiPort}/api/assets/cover/${assetId}`);
      if (!upstream.ok) return new Response(null, { status: upstream.status });
      // Pass through body + content-type
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
        },
      });
    } catch (e) {
      console.warn("[protocol:beatos-asset] error", e);
      return new Response(null, { status: 500 });
    }
  });

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
