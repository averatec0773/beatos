import { describe, expect, it } from "vitest";
import { useFileBrowserStore } from "@/stores/file-browser";

describe("file-browser store", () => {
  it("request opens the modal and resolves the selected path", async () => {
    const p = useFileBrowserStore.getState().request("file", [{ name: "Audio", extensions: ["wav"] }]);
    const s = useFileBrowserStore.getState();
    expect(s.open).toBe(true);
    expect(s.mode).toBe("file");
    expect(s.filters).toEqual([{ name: "Audio", extensions: ["wav"] }]);
    s.select("/Users/me/beat.wav");
    await expect(p).resolves.toBe("/Users/me/beat.wav");
    expect(useFileBrowserStore.getState().open).toBe(false);
  });

  it("cancel resolves null", async () => {
    const p = useFileBrowserStore.getState().request("folder");
    useFileBrowserStore.getState().cancel();
    await expect(p).resolves.toBeNull();
    expect(useFileBrowserStore.getState().open).toBe(false);
  });

  it("a new request resolves the in-flight one with null before replacing it", async () => {
    const first = useFileBrowserStore.getState().request("file");
    const second = useFileBrowserStore.getState().request("folder");
    await expect(first).resolves.toBeNull(); // superseded
    expect(useFileBrowserStore.getState().mode).toBe("folder");
    useFileBrowserStore.getState().select("/x/proj");
    await expect(second).resolves.toBe("/x/proj");
  });
});
