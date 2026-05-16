import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => "/tmp/fake-app/apps/desktop",
  },
  BrowserWindow: vi.fn(),
}));

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: true },
}));

let shouldShowSplash: (argv: readonly string[]) => boolean;
let closeDelayMs: (shownAt: number, now: number) => number;
let SPLASH_MIN_DISPLAY_MS: number;

beforeAll(async () => {
  const mod = await import("../splash");
  shouldShowSplash = mod.shouldShowSplash;
  closeDelayMs = mod.closeDelayMs;
  SPLASH_MIN_DISPLAY_MS = mod.SPLASH_MIN_DISPLAY_MS;
});

describe("shouldShowSplash", () => {
  it("returns true when --no-splash is absent", () => {
    expect(shouldShowSplash(["/path/main.js", "--smoke"])).toBe(true);
    expect(shouldShowSplash(["/path/main.js"])).toBe(true);
  });

  it("returns false when --no-splash is present", () => {
    expect(shouldShowSplash(["/path/main.js", "--no-splash"])).toBe(false);
    expect(shouldShowSplash(["/path/main.js", "--smoke", "--no-splash"])).toBe(false);
  });
});

describe("closeDelayMs", () => {
  it("returns 0 when elapsed >= SPLASH_MIN_DISPLAY_MS", () => {
    expect(closeDelayMs(0, SPLASH_MIN_DISPLAY_MS + 100)).toBe(0);
    expect(closeDelayMs(0, SPLASH_MIN_DISPLAY_MS)).toBe(0);
  });

  it("returns the remainder when elapsed < SPLASH_MIN_DISPLAY_MS", () => {
    expect(closeDelayMs(0, 100)).toBe(SPLASH_MIN_DISPLAY_MS - 100);
    expect(closeDelayMs(0, 599)).toBe(1);
  });

  it("never returns a negative value", () => {
    expect(closeDelayMs(0, SPLASH_MIN_DISPLAY_MS + 9999)).toBe(0);
  });
});

describe("createSplashWindow", () => {
  it("returns null when --no-splash flag is present", async () => {
    const mod = await import("../splash");
    expect(mod.createSplashWindow(["/path/main.js", "--no-splash"])).toBeNull();
  });
});
