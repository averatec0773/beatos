import { describe, it, expect } from "vitest";
import { BEATOS_MOODS } from "../moods";

describe("BEATOS_MOODS", () => {
  it("has exactly 50 entries", () => {
    expect(BEATOS_MOODS.length).toBe(50);
  });

  it("positive group has 12 entries", () => {
    expect(BEATOS_MOODS.filter((m) => m.group === "positive").length).toBe(12);
  });

  it("neutral group has 28 entries", () => {
    expect(BEATOS_MOODS.filter((m) => m.group === "neutral").length).toBe(28);
  });

  it("negative group has 10 entries", () => {
    expect(BEATOS_MOODS.filter((m) => m.group === "negative").length).toBe(10);
  });

  it("all entries have non-empty zh and en", () => {
    for (const m of BEATOS_MOODS) {
      expect(m.zh.length).toBeGreaterThan(0);
      expect(m.en.length).toBeGreaterThan(0);
    }
  });
});
