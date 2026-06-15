export const IPC_CHANNELS = {
  GET_API_BASE: "get-api-base",
  GET_API_TOKEN: "get-api-token",
  DIALOG_OPEN_FOLDER: "dialog:open-folder",
  DIALOG_OPEN_FILE: "dialog:open-file",
  SHELL_REVEAL_IN_FINDER: "shell:reveal-in-finder",
  SHELL_OPEN_PATH: "shell:open-path",
  SHELL_OPEN_EXTERNAL: "shell:open-external",
  APP_QUIT: "app:quit",
  PATH_HOME: "path:home",
  PATH_ENSURE_DIR: "path:ensure-dir",
  STORAGE_GET_DB_PATH: "storage:get-db-path",
  STORAGE_SET_DB_PATH: "storage:set-db-path",
  STORAGE_PICK_FOLDER: "storage:pick-folder",
  STORAGE_GET_REPO_ROOT: "storage:get-repo-root",
  SIDECAR_CRASHED: "sidecar-crashed",
  DRAG_OUT_FILE: "drag-out-file",
  MCP_TEST_CONNECTION: "mcp:test-connection",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
