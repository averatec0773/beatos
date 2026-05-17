import { describe, it, expect } from "vitest";
import { BEATOS_GENRES, genreLabel, genreKey } from "../genres";

describe("BEATOS_GENRES", () => {
  it("has exactly 74 entries", () => {
    expect(BEATOS_GENRES.length).toBe(74);
  });

  it("all entries have non-empty en", () => {
    for (const g of BEATOS_GENRES) {
      expect(g.en.length).toBeGreaterThan(0);
    }
  });

  it("entries marked — in source have zh: null", () => {
    const nullZhEntries = BEATOS_GENRES.filter((g) => g.zh === null);
    const englishNames = nullZhEntries.map((g) => g.en);
    expect(englishNames).toContain("Boom Bap");
    expect(englishNames).toContain("Hyperpop");
    expect(englishNames).toContain("Sexy Drill");
    expect(englishNames).toContain("Regalia");
    expect(englishNames).toContain("Rage");
    expect(englishNames).toContain("Plugg");
    expect(englishNames).toContain("Jersey Club");
    expect(englishNames).toContain("Jerk");
    expect(englishNames).toContain("2-Step Garage");
    expect(englishNames).toContain("Afrobeats");
    expect(nullZhEntries.length).toBe(10);
  });

  it("first entry is Pop", () => {
    expect(BEATOS_GENRES[0]).toEqual({ zh: "流行", en: "Pop" });
  });

  it("genreLabel with zh returns zh (en) format", () => {
    expect(genreLabel({ zh: "流行", en: "Pop" })).toBe("流行 (Pop)");
  });

  it("genreLabel with zh: null returns en only", () => {
    expect(genreLabel({ zh: null, en: "Boom Bap" })).toBe("Boom Bap");
  });

  it("genreKey returns en", () => {
    expect(genreKey({ zh: "流行", en: "Pop" })).toBe("Pop");
    expect(genreKey({ zh: null, en: "Boom Bap" })).toBe("Boom Bap");
  });
});
