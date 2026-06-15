import type { AssetKind, Platform } from "./types";

/** Thin pass-through to the preload bridge. Methods read `window.beatos`
 *  lazily so this module is import-safe even where the bridge is absent. */
export const electronPlatform: Platform = {
  kind: "electron",
  assetUrl: (kind: AssetKind, assetId: number) => `beatos-asset://${kind}/${assetId}`,
  getApiBase: () => window.beatos.getApiBase(),
  getApiToken: () => window.beatos.getApiToken(),
  openFolderDialog: () => window.beatos.openFolderDialog(),
  openFileDialog: (filters) => window.beatos.openFileDialog(filters),
  revealInFinder: (path) => window.beatos.revealInFinder(path),
  openPath: (path) => window.beatos.openPath(path),
  openExternal: (url) => window.beatos.openExternal(url),
  quitApp: () => window.beatos.quitApp(),
  getHomePath: () => window.beatos.getHomePath(),
  ensureDir: (dir) => window.beatos.ensureDir(dir),
  getDbPath: () => window.beatos.getDbPath(),
  getRepoRoot: () => window.beatos.getRepoRoot(),
  setDbPath: (p) => window.beatos.setDbPath(p),
  pickFolder: () => window.beatos.pickFolder(),
  testMcpConnection: () => window.beatos.testMcpConnection(),
  onSidecarCrashed: (cb) => window.beatos.onSidecarCrashed(cb),
  startDragFile: (absPath) => window.beatos.startDragFile(absPath),
  getPathForFile: (file) => window.beatos.getPathForFile(file),
  isAudioForceMuted: () => window.beatos.isAudioForceMuted(),
};
