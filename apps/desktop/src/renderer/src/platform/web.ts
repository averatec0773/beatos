import type { AssetKind, Platform } from "./types";
import { useFileBrowserStore } from "@/stores/file-browser";

async function postFs(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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
  // Web mode: no token. The SPA is same-origin and CORS preflight-blocks
  // cross-origin writes, so the sidecar guard stands down (BEATOS_API_TOKEN unset).
  getApiToken: () => Promise.resolve(null),
  openExternal: (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve();
  },
  // --- Phase 1: wired to FileBrowserDialog + /api/fs endpoints ---
  openFolderDialog: () => useFileBrowserStore.getState().request("folder"),
  openFileDialog: (filters) => useFileBrowserStore.getState().request("file", filters),
  // Same as openFolderDialog — both map to the folder file-browser in the web build
  // (distinct IPC channels only on the Electron side).
  pickFolder: () => useFileBrowserStore.getState().request("folder"),
  revealInFinder: async (path) => {
    await postFs("/api/fs/reveal", { path }).catch(() => {});
  },
  openPath: async (path) => {
    try {
      const res = await postFs("/api/fs/open", { path });
      const body = (await res.json()) as { ok?: boolean; error?: string; detail?: string };
      // Non-2xx (e.g. 404 path-not-found) returns FastAPI's {detail}, not {ok,error}.
      if (!res.ok) return body.detail ?? "open failed";
      return body.ok ? "" : (body.error ?? "open failed");
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  },
  quitApp: () => Promise.resolve(),
  getHomePath: () => Promise.resolve(""),
  ensureDir: (dir) => Promise.resolve(dir),
  getDbPath: () => Promise.resolve(""),
  getRepoRoot: () => Promise.resolve(""),
  setDbPath: () => Promise.resolve({ restartRequired: false }),
  testMcpConnection: () =>
    Promise.resolve({ ok: false as const, error: "MCP test is unavailable in the web app" }),
  installMcpClientConfig: (target) =>
    Promise.resolve({
      ok: false as const,
      target,
      error: "MCP client setup is only available in the desktop app",
    }),
  onSidecarCrashed: () => () => {},
  startDragFile: (absPath) => {
    // Browsers can't drag a file to the OS; download it instead.
    const a = document.createElement("a");
    a.href = `/api/fs/download?path=${encodeURIComponent(absPath)}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  getPathForFile: () => "",
  isAudioForceMuted: () => false,
};
