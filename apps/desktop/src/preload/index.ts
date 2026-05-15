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
  getLastLibrary: (): Promise<string | null> => ipcRenderer.invoke("config:get-last-library"),
  setLastLibrary: (path: string): Promise<void> =>
    ipcRenderer.invoke("config:set-last-library", path),
};

contextBridge.exposeInMainWorld("beatos", beatos);

export type BeatosAPI = typeof beatos;
