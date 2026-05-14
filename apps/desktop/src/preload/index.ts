import { contextBridge, ipcRenderer } from "electron";

const beatos = {
  getApiBase: (): Promise<string> => ipcRenderer.invoke("get-api-base"),
};

contextBridge.exposeInMainWorld("beatos", beatos);

export type BeatosAPI = typeof beatos;
