import { describe, it, expect } from "vitest";
import { isSafeAbsolutePath } from "../path-safety";

// process.platform is the host (posix in CI/dev) — exercise the posix branch
// plus the platform-independent rejections.
describe("isSafeAbsolutePath", () => {
  it("accepts a plain absolute path", () => {
    expect(isSafeAbsolutePath("/Users/me/Music/BeatOS")).toBe(true);
  });

  it("rejects a relative path", () => {
    expect(isSafeAbsolutePath("Music/BeatOS")).toBe(false);
    expect(isSafeAbsolutePath("./x")).toBe(false);
  });

  it("rejects any path containing a parent-dir segment", () => {
    expect(isSafeAbsolutePath("/Users/me/../../etc/passwd")).toBe(false);
  });

  it("rejects empty and non-string input", () => {
    expect(isSafeAbsolutePath("")).toBe(false);
    expect(isSafeAbsolutePath(undefined)).toBe(false);
    expect(isSafeAbsolutePath(null)).toBe(false);
    expect(isSafeAbsolutePath(42)).toBe(false);
  });
});
