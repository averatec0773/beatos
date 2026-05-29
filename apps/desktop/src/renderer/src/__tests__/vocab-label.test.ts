import { describe, it, expect } from "vitest";

import { formatVocabLabel } from "@/data/vocab-label";

describe("formatVocabLabel", () => {
  // genre with a Chinese translation: Trap Rap → 陷阱说唱
  it("genre both → '中文 (English)'", () => {
    expect(formatVocabLabel("Trap Rap", "genre", "both")).toBe("陷阱说唱 (Trap Rap)");
  });
  it("genre zh → Chinese only", () => {
    expect(formatVocabLabel("Trap Rap", "genre", "zh")).toBe("陷阱说唱");
  });
  it("genre en → English only", () => {
    expect(formatVocabLabel("Trap Rap", "genre", "en")).toBe("Trap Rap");
  });

  // genre WITHOUT a Chinese translation (zh === null): Boom Bap
  it("en-only genre both → plain English (no parens)", () => {
    expect(formatVocabLabel("Boom Bap", "genre", "both")).toBe("Boom Bap");
  });
  it("en-only genre zh → falls back to English", () => {
    expect(formatVocabLabel("Boom Bap", "genre", "zh")).toBe("Boom Bap");
  });

  // mood (always has Chinese): Happiness → 幸福
  it("mood both → '中文 (English)'", () => {
    expect(formatVocabLabel("Happiness", "mood", "both")).toBe("幸福 (Happiness)");
  });
  it("mood zh → Chinese only", () => {
    expect(formatVocabLabel("Happiness", "mood", "zh")).toBe("幸福");
  });

  // value not in any table (e.g. legacy/custom): return as-is for all locales
  it("unknown value → returned unchanged", () => {
    expect(formatVocabLabel("Nonexistent", "genre", "zh")).toBe("Nonexistent");
    expect(formatVocabLabel("Nonexistent", "mood", "both")).toBe("Nonexistent");
  });
});
