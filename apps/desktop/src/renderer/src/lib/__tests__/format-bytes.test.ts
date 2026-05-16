import { describe, it, expect } from "vitest";
import { formatBytes } from "../format-bytes";

describe("formatBytes", () => {
  it("returns em-dash for null/0", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(0)).toBe("—");
  });
  it("formats < 1 KB as bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });
  it("formats KB with no decimal", () => {
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(10 * 1024)).toBe("10.0 KB"); // ≥10 gets decimal
  });
  it("formats MB with one decimal", () => {
    expect(formatBytes(25 * 1024 * 1024 + 300 * 1024)).toBe("25.3 MB");
  });
  it("formats GB with one decimal", () => {
    expect(formatBytes(1.2 * 1024 * 1024 * 1024)).toBe("1.2 GB");
  });
});
