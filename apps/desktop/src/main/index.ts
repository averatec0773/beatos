import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from "electron";
import { join, dirname, basename } from "node:path";
import { existsSync, mkdirSync, readFileSync, unlinkSync, promises as fsPromises } from "node:fs";
import { spawn, ChildProcess } from "node:child_process";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";

import { readConfig, writeConfig } from "./config";

const HANDSHAKE_TIMEOUT_MS = 5000;
const HANDSHAKE_POLL_MS = 50;
const SIDECAR_KILL_GRACE_MS = 3000;

let sidecar: ChildProcess | null = null;
let apiPort: number | null = null;

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
  return readConfig().dbPath ?? join(app.getPath("music"), "BeatOS", "global.db");
}

function startSidecar(): void {
  ensureRuntimeDir();
  const hp = handshakePath();
  clearStaleHandshake(hp);

  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  sidecar = spawn("uv", ["run", "python", "-m", "beatos_http"], {
    cwd: repoRoot(),
    env: {
      ...process.env,
      BEATOS_HANDSHAKE_PATH: hp,
      BEATOS_DB_PATH: dbPath,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  sidecar.on("exit", (code, signal) => {
    console.log(`[sidecar] exited code=${code} signal=${signal}`);
    sidecar = null;
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

  win.on("ready-to-show", () => win.show());
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
  electronApp.setAppUserModelId("studio.averatec.beatos");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.handle("get-api-base", () => {
    if (apiPort == null) throw new Error("API not ready");
    return `http://127.0.0.1:${apiPort}`;
  });

  ipcMain.handle("dialog:open-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Choose Library Folder",
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("app:quit", () => app.quit());

  ipcMain.handle("path:home", () => app.getPath("home"));

  ipcMain.handle("storage:get-db-path", () => resolveDbPath());

  ipcMain.handle("storage:set-db-path", (_e, newPath: string) => {
    mkdirSync(dirname(newPath), { recursive: true });
    writeConfig({ dbPath: newPath });
    return { restartRequired: true };
  });

  ipcMain.handle("storage:pick-folder", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(
    "fs:copy-into-source",
    async (_e, src: string, destSourceRoot: string, subfolder: string | null) => {
      const targetDir = subfolder ? join(destSourceRoot, subfolder) : destSourceRoot;
      mkdirSync(targetDir, { recursive: true });
      const dest = join(targetDir, basename(src));
      await fsPromises.copyFile(src, dest);
      return dest;
    }
  );

  ipcMain.handle(
    "fs:move-into-source",
    async (_e, src: string, destSourceRoot: string, subfolder: string | null) => {
      const targetDir = subfolder ? join(destSourceRoot, subfolder) : destSourceRoot;
      mkdirSync(targetDir, { recursive: true });
      const dest = join(targetDir, basename(src));
      await fsPromises.rename(src, dest);
      return dest;
    }
  );

  ipcMain.handle(
    "dialog:open-file",
    async (_e, filters: { name: string; extensions: string[] }[]) => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters,
        title: "Choose File",
      });
      return result.canceled ? null : result.filePaths[0];
    }
  );

  ipcMain.handle("shell:reveal-in-finder", (_e, path: string) => {
    shell.showItemInFolder(path);
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

  startSidecar();
  apiPort = await waitForHandshake();

  createWindow();

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
