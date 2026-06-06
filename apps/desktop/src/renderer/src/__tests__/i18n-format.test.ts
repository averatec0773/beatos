import { describe, expect, it } from "vitest";

import { formatDate, formatNumber, formatRelativeTime } from "@/i18n/format";

describe("i18n/format", () => {
  const now = 1_700_000_000_000;

  it("formats relative minutes per language", () => {
    const ninetySecAgo = now - 90_000;
    expect(formatRelativeTime("en", ninetySecAgo, now)).toContain("minute");
    expect(formatRelativeTime("zh", ninetySecAgo, now)).toContain("分钟");
  });

  it("uses numeric:auto for one day ago", () => {
    const oneDayAgo = now - 86_400_000;
    expect(formatRelativeTime("en", oneDayAgo, now).toLowerCase()).toContain("yesterday");
    expect(formatRelativeTime("zh", oneDayAgo, now)).toContain("昨天");
  });

  it("localizes grouped numbers", () => {
    expect(formatNumber("en", 12345)).toBe("12,345");
  });

  it("formats dates per locale", () => {
    const d = new Date("2023-11-14T12:00:00Z");
    expect(formatDate("en", d)).toContain("2023");
    expect(formatDate("zh", d)).toContain("2023");
    expect(formatDate("en", d)).not.toBe(formatDate("zh", d));
  });

  it("does not overflow relative-time buckets near unit boundaries", () => {
    expect(formatRelativeTime("en", now - 3_599_000, now)).toContain("hour");
    expect(formatRelativeTime("en", now - 86_399_000, now).toLowerCase()).toContain("yesterday");
  });
});
