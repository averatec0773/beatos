import { describe, it, expect } from "vitest";
import { parsePrice } from "./price-parse";

describe("parsePrice", () => {
  it("single CNY tier", () => {
    expect(parsePrice("Basic: ¥50")).toEqual([{ name: "Basic", amounts: { CNY: 50 } }]);
  });
  it("multi tier, multi currency", () => {
    expect(parsePrice("Basic: ¥50\nPremium: ¥300 / USD 50")).toEqual([
      { name: "Basic", amounts: { CNY: 50 } },
      { name: "Premium", amounts: { CNY: 300, USD: 50 } },
    ]);
  });
  it("dash means no amounts", () => {
    expect(parsePrice("Exclusive: —")).toEqual([{ name: "Exclusive", amounts: {} }]);
  });
  it("empty -> []", () => {
    expect(parsePrice("")).toEqual([]);
  });
  it("ignores blank lines and trims", () => {
    expect(parsePrice("  Basic: ¥50  \n\n")).toEqual([{ name: "Basic", amounts: { CNY: 50 } }]);
  });
});
