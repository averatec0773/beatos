import { describe, it, expect } from "vitest";
import { formatRowDate } from "../format-row-date";

describe("formatRowDate", () => {
  it("formats ISO date as YYYY-MM-DD", () => {
    expect(formatRowDate("2026-05-16T14:30:00+00:00")).toBe("2026-05-16");
  });
  it("formats ISO date without time component", () => {
    expect(formatRowDate("2026-01-01")).toBe("2026-01-01");
  });
  it("returns em-dash for null", () => {
    expect(formatRowDate(null)).toBe("—");
  });
  it("returns em-dash for invalid string", () => {
    expect(formatRowDate("not a date")).toBe("—");
  });
  it("returns em-dash for empty string", () => {
    expect(formatRowDate("")).toBe("—");
  });
});
