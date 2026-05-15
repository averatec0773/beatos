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
  getDbPath: (): Promise<string> => ipcRenderer.invoke("storage:get-db-path"),
  setDbPath: (p: string): Promise<{ restartRequired: boolean }> =>
    ipcRenderer.invoke("storage:set-db-path", p),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke("storage:pick-folder"),
};

contextBridge.exposeInMainWorld("beatos", beatos);

export type BeatosAPI = typeof beatos;
