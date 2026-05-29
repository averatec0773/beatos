import { describe, it, expect } from "vitest";
import { parseKey, formatKey } from "../parse-key";

describe("parseKey", () => {
  it("parses canonical strings", () => {
    expect(parseKey("F# minor")).toEqual({ note: "F#", mode: "minor" });
    expect(parseKey("Eb major")).toEqual({ note: "Eb", mode: "major" });
    expect(parseKey("C major")).toEqual({ note: "C", mode: "major" });
  });
  it("is case-insensitive for mode", () => {
    expect(parseKey("F# Minor")).toEqual({ note: "F#", mode: "minor" });
    expect(parseKey("eb MAJOR")).toEqual({ note: "Eb", mode: "major" });
  });
  it("returns null for null/empty/unparseable", () => {
    expect(parseKey(null)).toBeNull();
    expect(parseKey("")).toBeNull();
    expect(parseKey("F#m")).toBeNull(); // legacy form, not normalized
    expect(parseKey("Cmaj")).toBeNull();
    expect(parseKey("random text")).toBeNull();
  });
});

describe("formatKey", () => {
  it("formats note + mode into canonical string", () => {
    expect(formatKey("F#", "minor")).toBe("F# minor");
    expect(formatKey("Eb", "major")).toBe("Eb major");
  });
});
