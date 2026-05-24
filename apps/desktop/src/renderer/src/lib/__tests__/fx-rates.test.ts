import { describe, it, expect } from "vitest";

import {
  buildFxHint,
  convertFx,
  currencySymbol,
  fxConvertedString,
  pickHintCurrencies,
} from "../fx-rates";

describe("convertFx", () => {
  it("returns the same amount for same-currency conversion", () => {
    expect(convertFx(100, "USD", "USD")).toBe(100);
    expect(convertFx(0, "CNY", "CNY")).toBe(0);
  });

  it("USD → CNY uses the snapshot rate", () => {
    // 1 USD / 0.139 USD-per-CNY ≈ 7.19 CNY
    const r = convertFx(1, "USD", "CNY");
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(1 / 0.139, 4);
  });

  it("returns null for unknown currencies", () => {
    expect(convertFx(10, "USD", "ZZZ")).toBeNull();
    expect(convertFx(10, "XXX", "USD")).toBeNull();
  });
});

describe("pickHintCurrencies", () => {
  it("excludes the primary currency", () => {
    const r = pickHintCurrencies("USD", 2);
    expect(r).not.toContain("USD");
  });

  it("returns at most `max` entries", () => {
    expect(pickHintCurrencies("USD", 1)).toHaveLength(1);
    expect(pickHintCurrencies("USD", 3)).toHaveLength(3);
  });

  it("CNY primary surfaces USD first", () => {
    expect(pickHintCurrencies("CNY", 2)[0]).toBe("USD");
  });
});

describe("buildFxHint", () => {
  it("returns empty string when price is null", () => {
    expect(buildFxHint(null, "CNY")).toBe("");
  });

  it("formats CNY 700 with two alternate currencies", () => {
    const hint = buildFxHint(700, "CNY");
    expect(hint.startsWith("≈ ")).toBe(true);
    // Should contain the $ and € symbols
    expect(hint).toContain("$");
    expect(hint).toContain("€");
  });

  it("JPY hint rounds to whole yen", () => {
    const hint = buildFxHint(10, "USD", ["JPY"]);
    // 10 USD * (1/0.0066) ≈ 1515 JPY (no decimal)
    expect(hint).toMatch(/^≈ ¥\d+$/);
  });

  it("non-JPY trailing zeros are stripped", () => {
    // 100 USD → 92.59 EUR (mid-snapshot); ensure no .00 padding
    const hint = buildFxHint(100, "USD", ["EUR"]);
    expect(hint).not.toMatch(/\.\d*0$/);
  });

  it("returns empty when all alternates are unknown", () => {
    expect(buildFxHint(100, "USD", ["ZZZ"])).toBe("");
  });
});

describe("currencySymbol", () => {
  it("falls back to the ISO code for unknown currencies", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("ZZZ")).toBe("ZZZ");
  });
});

describe("fxConvertedString", () => {
  it("returns a bare number, no '≈' / symbol / alternates", () => {
    const s = fxConvertedString(100, "USD", "CNY");
    // ≈ 719 CNY; bare digits only
    expect(s).toMatch(/^\d+(\.\d+)?$/);
  });

  it("JPY result is integer", () => {
    const s = fxConvertedString(10, "USD", "JPY");
    expect(s).toMatch(/^\d+$/);
  });

  it("returns empty string for unknown currency", () => {
    expect(fxConvertedString(100, "USD", "ZZZ")).toBe("");
  });

  it("returns empty string for non-finite input", () => {
    expect(fxConvertedString(NaN, "USD", "CNY")).toBe("");
    expect(fxConvertedString(Infinity, "USD", "CNY")).toBe("");
  });

  it("identity conversion preserves the amount as a clean string", () => {
    expect(fxConvertedString(50, "USD", "USD")).toBe("50");
  });
});
