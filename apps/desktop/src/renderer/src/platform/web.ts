import type { AssetKind, Platform } from "./types";

/** Browser implementation. Phase 0 implements same-origin networking + the
 *  always-safe methods; file/system methods are degraded stubs that never throw
 *  (Phase 1 fills them in via a backend file-browser + downloads). */
export const webPlatform: Platform = {
  kind: "web",
  assetUrl: (kind: AssetKind, assetId: number) => `/api/assets/${kind}/${assetId}`,
  // Same-origin: the SPA is served by the sidecar, so the API is at the page
  // origin. Returning a concrete origin (not "") keeps client.ts's base cache
  // effective (it caches truthy values only).
  getApiBase: () => Promise.resolve(window.location.origin),
  openExternal: (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve();
  },
  // --- Degraded stubs (Phase 1/2) — safe no-ops, never throw. ---
  openFolderDialog: () => Promise.resolve(null),
  openFileDialog: () => Promise.resolve(null),
  // User-initiated native actions with no browser equivalent: warn so the
  // degradation is visible during Phase-0 web testing instead of silently doing
  // nothing (Phase 1 wires real downloads / a backend file browser).
  revealInFinder: (path) => {
    console.warn("[platform/web] revealInFinder is unavailable in the web build", path);
    return Promise.resolve();
  },
  openPath: () => Promise.resolve(""),
  quitApp: () => Promise.resolve(),
  getHomePath: () => Promise.resolve(""),
  ensureDir: (dir) => Promise.resolve(dir),
  getDbPath: () => Promise.resolve(""),
  getRepoRoot: () => Promise.resolve(""),
  setDbPath: () => Promise.resolve({ restartRequired: false }),
  pickFolder: () => Promise.resolve(null),
  testMcpConnection: () =>
    Promise.resolve({ ok: false as const, error: "MCP test is unavailable in the web app" }),
  onSidecarCrashed: () => () => {},
  startDragFile: (absPath) => {
    console.warn("[platform/web] startDragFile is unavailable in the web build", absPath);
  },
  getPathForFile: () => "",
  isAudioForceMuted: () => false,
};
