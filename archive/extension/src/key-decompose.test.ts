import { describe, it, expect } from "vitest";
import { decomposeKey } from "./key-decompose";

describe("decomposeKey", () => {
  it("sharp minor", () => {
    expect(decomposeKey("F# minor")).toEqual({ note: "F", accidental: "sharp", mode: "minor" });
  });
  it("flat major (b and ♭)", () => {
    expect(decomposeKey("Bb major")).toEqual({ note: "B", accidental: "flat", mode: "major" });
    expect(decomposeKey("B♭ major")).toEqual({ note: "B", accidental: "flat", mode: "major" });
  });
  it("natural", () => {
    expect(decomposeKey("C major")).toEqual({ note: "C", accidental: "natural", mode: "major" });
    expect(decomposeKey("A minor")).toEqual({ note: "A", accidental: "natural", mode: "minor" });
  });
  it("abbreviations + ♯", () => {
    expect(decomposeKey("C# maj")).toEqual({ note: "C", accidental: "sharp", mode: "major" });
    expect(decomposeKey("G♯ min")).toEqual({ note: "G", accidental: "sharp", mode: "minor" });
  });
  it("defaults mode to major when absent", () => {
    expect(decomposeKey("D")).toEqual({ note: "D", accidental: "natural", mode: "major" });
  });
  it("unparseable -> null", () => {
    expect(decomposeKey("")).toBeNull();
    expect(decomposeKey("nonsense")).toBeNull();
    expect(decomposeKey("H minor")).toBeNull();
  });
});
