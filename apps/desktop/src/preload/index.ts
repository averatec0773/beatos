import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-channels";

const beatos = {
  getApiBase: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.GET_API_BASE),
  openFolderDialog: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FOLDER),
  openFileDialog: (
    filters: { name: string; extensions: string[] }[]
  ): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_FILE, filters),
  revealInFinder: (path: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SHELL_REVEAL_IN_FINDER, path),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url),
  quitApp: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
  getHomePath: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.PATH_HOME),
  ensureDir: (dir: string): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.PATH_ENSURE_DIR, dir),
  getDbPath: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_GET_DB_PATH),
  setDbPath: (p: string): Promise<{ restartRequired: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SET_DB_PATH, p),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_PICK_FOLDER),
  copyIntoSource: (src: string, root: string, sub: string | null): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_COPY_INTO_SOURCE, src, root, sub),
  moveIntoSource: (src: string, root: string, sub: string | null): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.FS_MOVE_INTO_SOURCE, src, root, sub),
  onSidecarCrashed: (cb: (info: { code: number | null; signal: string | null }) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { code: number | null; signal: string | null }) => cb(info);
    ipcRenderer.on(IPC_CHANNELS.SIDECAR_CRASHED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SIDECAR_CRASHED, handler);
  },
  startDragFile: (absPath: string): void => {
    ipcRenderer.send(IPC_CHANNELS.DRAG_OUT_FILE, { absPath });
  },
};

contextBridge.exposeInMainWorld("beatos", beatos);

export type BeatosAPI = typeof beatos;
