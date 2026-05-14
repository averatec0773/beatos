import { contextBridge, ipcRenderer } from "electron";

const beatos = {
  getApiBase: (): Promise<string> => ipcRenderer.invoke("get-api-base"),
  openFolderDialog: (): Promise<string | null> => ipcRenderer.invoke("dialog:open-folder"),
  quitApp: (): Promise<void> => ipcRenderer.invoke("app:quit"),
  getLastLibrary: (): Promise<string | null> => ipcRenderer.invoke("config:get-last-library"),
  setLastLibrary: (path: string): Promise<void> => ipcRenderer.invoke("config:set-last-library", path),
};

contextBridge.exposeInMainWorld("beatos", beatos);

export type BeatosAPI = typeof beatos;
