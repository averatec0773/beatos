import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { spawn, ChildProcess } from "node:child_process";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";

const HANDSHAKE_TIMEOUT_MS = 5000;
const HANDSHAKE_POLL_MS = 50;
const SIDECAR_KILL_GRACE_MS = 3000;

let sidecar: ChildProcess | null = null;
let apiPort: number | null = null;

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
  // out/main/index.js → repo root (4 levels up)
  return join(__dirname, "..", "..", "..", "..");
}

function startSidecar(): void {
  ensureRuntimeDir();
  const hp = handshakePath();
  clearStaleHandshake(hp);

  sidecar = spawn("uv", ["run", "python", "-m", "beatos_http"], {
    cwd: repoRoot(),
    env: { ...process.env, BEATOS_HANDSHAKE_PATH: hp },
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
        // file may be mid-write; retry
      }
    }
    await new Promise((r) => setTimeout(r, HANDSHAKE_POLL_MS));
  }
  throw new Error(`Sidecar handshake not seen at ${hp} within ${HANDSHAKE_TIMEOUT_MS}ms`);
}

function stopSidecar(): void {
  if (!sidecar) return;
  const child = sidecar;
  sidecar = null; // null immediately so a second call (e.g. before-quit after window-all-closed) is a no-op
  child.kill("SIGTERM");
  const killTimer = setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, SIDECAR_KILL_GRACE_MS);
  child.once("exit", () => clearTimeout(killTimer));
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#121212",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      // sandbox: false is required because preload uses ipcRenderer (a Node API).
      // contextIsolation + nodeIntegration:false still keep the renderer isolated.
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
