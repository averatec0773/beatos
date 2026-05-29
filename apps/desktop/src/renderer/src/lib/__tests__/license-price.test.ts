import { describe, it, expect } from "vitest";
import {
  inputsToPrices,
  pickFxSource,
  fxPlaceholderFor,
  FIXED_CURRENCIES,
  OTHER_CURRENCIES,
  PRESET_KEYS,
} from "../license-price";

describe("inputsToPrices", () => {
  it("keeps fixed currencies with valid non-negative numbers", () => {
    expect(inputsToPrices({ CNY: "300", USD: "50" }, null)).toEqual({ CNY: 300, USD: 50 });
  });
  it("drops blank, negative, and non-numeric inputs", () => {
    expect(inputsToPrices({ CNY: "  ", USD: "-5" }, null)).toEqual({});
    expect(inputsToPrices({ CNY: "abc", USD: "0" }, null)).toEqual({ USD: 0 });
  });
  it("includes the third (other) currency only when selected and non-blank", () => {
    expect(inputsToPrices({ EUR: "40" }, "EUR")).toEqual({ EUR: 40 });
    expect(inputsToPrices({ EUR: "40" }, null)).toEqual({});
  });
});

describe("pickFxSource", () => {
  it("returns the first positive slot in CNY→USD→other order", () => {
    expect(pickFxSource({ CNY: "300", USD: "50" }, null)).toEqual(["CNY", 300]);
    expect(pickFxSource({ USD: "50" }, null)).toEqual(["USD", 50]);
  });
  it("skips zero / blank and falls through to the other currency", () => {
    expect(pickFxSource({ CNY: "0", EUR: "40" }, "EUR")).toEqual(["EUR", 40]);
    expect(pickFxSource({}, null)).toBeNull();
  });
});

describe("fxPlaceholderFor", () => {
  it("returns the em-dash when there is no source or same currency", () => {
    expect(fxPlaceholderFor("USD", null)).toBe("—");
    expect(fxPlaceholderFor("CNY", ["CNY", 300])).toBe("—");
  });
});

describe("constants", () => {
  it("fixed currencies are CNY+USD and excluded from the other-currency list", () => {
    expect([...FIXED_CURRENCIES]).toEqual(["CNY", "USD"]);
    expect(OTHER_CURRENCIES).not.toContain("CNY");
    expect(OTHER_CURRENCIES).not.toContain("USD");
  });
  it("preset keys are the three deliverable tokens", () => {
    expect([...PRESET_KEYS].sort()).toEqual(["mp3", "stem", "wav"]);
  });
});
