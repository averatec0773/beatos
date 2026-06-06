import { describe, expect, it } from "vitest";
import { electronPlatform } from "@/platform/electron";
import { webPlatform } from "@/platform/web";

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
    expect(await webPlatform.openFileDialog([])).toBeNull();
    expect(await webPlatform.pickFolder()).toBeNull();
    expect(webPlatform.getPathForFile(new File([], "x.wav"))).toBe("");
    expect(webPlatform.isAudioForceMuted()).toBe(false);
    const off = webPlatform.onSidecarCrashed(() => {});
    expect(typeof off).toBe("function");
    off();
  });
});
