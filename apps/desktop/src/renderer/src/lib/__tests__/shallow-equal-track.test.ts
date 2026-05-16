import { describe, it, expect } from "vitest";
import { shallowEqualEditable } from "../shallow-equal-track";

type EditableFields = {
  title: string;
  bpm: number | null;
  key_signature: string | null;
  genre: string | null;
  mood: string | null;
  tags: string[] | null;
  description: string | null;
  license_type: string;
  price: number | null;
  producer: string | null;
};

function base(): EditableFields {
  return {
    title: "Test Beat",
    bpm: 140,
    key_signature: "Cm",
    genre: "Trap",
    mood: "Dark",
    tags: ["a", "b"],
    description: "A test beat",
    license_type: "lease_basic",
    price: 29.99,
    producer: "averatec",
  };
}

describe("shallowEqualEditable", () => {
  it("returns true for identical objects", () => {
    expect(shallowEqualEditable(base(), base())).toBe(true);
  });

  it("returns false when title differs", () => {
    const a = base();
    const b = base();
    b.title = "Other Beat";
    expect(shallowEqualEditable(a, b)).toBe(false);
  });

  it("returns false when bpm differs", () => {
    const a = base();
    const b = base();
    b.bpm = 160;
    expect(shallowEqualEditable(a, b)).toBe(false);
  });

  it("returns false when tags array contents differ (order matters)", () => {
    const a = base();
    const b = base();
    b.tags = ["b", "a"];
    expect(shallowEqualEditable(a, b)).toBe(false);
  });

  it("returns true when both tags are null", () => {
    const a = base();
    const b = base();
    a.tags = null;
    b.tags = null;
    expect(shallowEqualEditable(a, b)).toBe(true);
  });

  it("returns true when both have same non-string numeric field (bpm)", () => {
    const a = base();
    const b = base();
    a.bpm = 120;
    b.bpm = 120;
    expect(shallowEqualEditable(a, b)).toBe(true);
  });

  it("returns false when one tags is null and the other is not", () => {
    const a = base();
    const b = base();
    a.tags = null;
    b.tags = ["a"];
    expect(shallowEqualEditable(a, b)).toBe(false);
  });
});
