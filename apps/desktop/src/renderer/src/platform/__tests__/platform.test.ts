import { describe, expect, it, vi } from "vitest";
import { electronPlatform } from "@/platform/electron";
import { webPlatform } from "@/platform/web";
import { useFileBrowserStore } from "@/stores/file-browser";

describe("platform.assetUrl", () => {
  it("electron uses the beatos-asset:// protocol", () => {
    expect(electronPlatform.assetUrl("audio", 7)).toBe("beatos-asset://audio/7");
    expect(electronPlatform.assetUrl("cover", 42)).toBe("beatos-asset://cover/42");
  });

  it("web uses same-origin /api/assets paths", () => {
    expect(webPlatform.assetUrl("audio", 7)).toBe("/api/assets/audio/7");
    expect(webPlatform.assetUrl("cover", 42)).toBe("/api/assets/cover/42");
  });
});

describe("platform.getApiBase", () => {
  it("electron delegates to window.beatos (mocked to 127.0.0.1:5555 in setup)", async () => {
    expect(await electronPlatform.getApiBase()).toBe("http://127.0.0.1:5555");
  });

  it("web returns window.location.origin", async () => {
    expect(await webPlatform.getApiBase()).toBe(window.location.origin);
  });
});

describe("web degraded stubs never throw", () => {
  it("file/system methods resolve to safe defaults", async () => {
    expect(webPlatform.getPathForFile(new File([], "x.wav"))).toBe("");
    expect(webPlatform.isAudioForceMuted()).toBe(false);
    const off = webPlatform.onSidecarCrashed(() => {});
    expect(typeof off).toBe("function");
    off();
  });
});

describe("web file methods", () => {
  it("openFileDialog opens the file browser and resolves the picked path", async () => {
    const p = webPlatform.openFileDialog([{ name: "Audio", extensions: ["wav"] }]);
    expect(useFileBrowserStore.getState().open).toBe(true);
    expect(useFileBrowserStore.getState().mode).toBe("file");
    useFileBrowserStore.getState().select("/x/beat.wav");
    await expect(p).resolves.toBe("/x/beat.wav");
  });

  it("pickFolder opens the browser in folder mode", async () => {
    const p = webPlatform.pickFolder();
    expect(useFileBrowserStore.getState().mode).toBe("folder");
    useFileBrowserStore.getState().select("/x/proj");
    await expect(p).resolves.toBe("/x/proj");
  });

  it("revealInFinder POSTs the path to /api/fs/reveal", async () => {
    const calls: { url: string; body: unknown }[] = [];
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    });
    await webPlatform.revealInFinder("/x/beat.wav");
    expect(calls[0].url).toBe("/api/fs/reveal");
    expect(calls[0].body).toEqual({ path: "/x/beat.wav" });
  });

  it("openPath returns '' on ok and the error string otherwise", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: false, error: "nope" }) } as Response),
    );
    await expect(webPlatform.openPath("/x")).resolves.toBe("nope");
  });

  it("openPath surfaces the FastAPI {detail} on a non-2xx response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ detail: "Path not found." }),
      } as Response),
    );
    await expect(webPlatform.openPath("/missing")).resolves.toBe("Path not found.");
  });
});
