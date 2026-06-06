import { describe, expect, it } from "vitest";

import en from "@/i18n/locales/en/translation.json";
import zh from "@/i18n/locales/zh/translation.json";

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" && !Array.isArray(v)
      ? flatten(v as Record<string, unknown>, key)
      : [key];
  });
}

describe("i18n catalogs", () => {
  it("en and zh have identical key sets", () => {
    expect(flatten(zh).sort()).toEqual(flatten(en).sort());
  });
});
