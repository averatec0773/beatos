import { describe, it, expect } from "vitest";
import { formatChipLabel } from "../format-chip-label";

describe("formatChipLabel", () => {
  it("formats single value as 'Field · value'", () => {
    expect(formatChipLabel("Producer", ["a"])).toBe("Producer · a");
  });
  it("formats two values as 'Field · a, b'", () => {
    expect(formatChipLabel("Producer", ["a", "b"])).toBe("Producer · a, b");
  });
  it("formats 3 values as 'Field · 3 selected'", () => {
    expect(formatChipLabel("Producer", ["a", "b", "c"])).toBe("Producer · 3 selected");
  });
  it("formats 4+ values as 'Field · N selected'", () => {
    expect(formatChipLabel("Genre", ["a", "b", "c", "d"])).toBe("Genre · 4 selected");
  });
  it("returns field name when no values", () => {
    expect(formatChipLabel("Producer", [])).toBe("Producer");
  });
});
