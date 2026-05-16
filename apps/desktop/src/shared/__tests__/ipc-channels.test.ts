import { describe, it, expect } from "vitest";
import { IPC_CHANNELS } from "../ipc-channels";

describe("IPC_CHANNELS", () => {
  it("all values are unique strings", () => {
    const values = Object.values(IPC_CHANNELS);
    expect(new Set(values).size).toBe(values.length);
    values.forEach((v) => expect(typeof v).toBe("string"));
  });

  it("matches known channel inventory", () => {
    expect(IPC_CHANNELS).toMatchInlineSnapshot(`
      {
        "APP_QUIT": "app:quit",
        "DIALOG_OPEN_FILE": "dialog:open-file",
        "DIALOG_OPEN_FOLDER": "dialog:open-folder",
        "FS_COPY_INTO_SOURCE": "fs:copy-into-source",
        "FS_MOVE_INTO_SOURCE": "fs:move-into-source",
        "GET_API_BASE": "get-api-base",
        "PATH_ENSURE_DIR": "path:ensure-dir",
        "PATH_HOME": "path:home",
        "SHELL_OPEN_EXTERNAL": "shell:open-external",
        "SHELL_REVEAL_IN_FINDER": "shell:reveal-in-finder",
        "SIDECAR_CRASHED": "sidecar-crashed",
        "STORAGE_GET_DB_PATH": "storage:get-db-path",
        "STORAGE_PICK_FOLDER": "storage:pick-folder",
        "STORAGE_SET_DB_PATH": "storage:set-db-path",
      }
    `);
  });
});
