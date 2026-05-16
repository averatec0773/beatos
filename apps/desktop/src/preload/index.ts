import { contextBridge, ipcRenderer } from "electron";

const beatos = {
  getApiBase: (): Promise<string> => ipcRenderer.invoke("get-api-base"),
  openFolderDialog: (): Promise<string | null> => ipcRenderer.invoke("dialog:open-folder"),
  openFileDialog: (
    filters: { name: string; extensions: string[] }[]
  ): Promise<string | null> => ipcRenderer.invoke("dialog:open-file", filters),
  revealInFinder: (path: string): Promise<void> =>
    ipcRenderer.invoke("shell:reveal-in-finder", path),
  quitApp: (): Promise<void> => ipcRenderer.invoke("app:quit"),
  getHomePath: (): Promise<string> => ipcRenderer.invoke("path:home"),
  ensureDir: (dir: string): Promise<string> => ipcRenderer.invoke("path:ensure-dir", dir),
  getDbPath: (): Promise<string> => ipcRenderer.invoke("storage:get-db-path"),
  setDbPath: (p: string): Promise<{ restartRequired: boolean }> =>
    ipcRenderer.invoke("storage:set-db-path", p),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("storage:pick-folder"),
  copyIntoSource: (src: string, root: string, sub: string | null): Promise<string> =>
    ipcRenderer.invoke("fs:copy-into-source", src, root, sub),
  moveIntoSource: (src: string, root: string, sub: string | null): Promise<string> =>
    ipcRenderer.invoke("fs:move-into-source", src, root, sub),
  onSidecarCrashed: (cb: (info: { code: number | null; signal: string | null }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { code: number | null; signal: string | null }) => cb(info);
    ipcRenderer.on("sidecar-crashed", handler);
    return () => ipcRenderer.removeListener("sidecar-crashed", handler);
  },
};

contextBridge.exposeInMainWorld("beatos", beatos);

export type BeatosAPI = typeof beatos;
