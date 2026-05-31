import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, unknown> = {};
vi.mock("@/api/app-settings", () => ({
  appSettings: {
    get: vi.fn(async (k: string) => ({ key: k, value: store[k] ?? null })),
    set: vi.fn(async (k: string, v: unknown) => {
      store[k] = v;
      return { key: k, value: v };
    }),
    remove: vi.fn(),
  },
}));

import { loadPrimaryProducer, savePrimaryProducer } from "@/lib/known-producers";

describe("primary producer setting", () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it("returns empty string when unset", async () => {
    expect(await loadPrimaryProducer()).toBe("");
  });

  it("round-trips a saved name", async () => {
    await savePrimaryProducer("Averatec");
    expect(await loadPrimaryProducer()).toBe("Averatec");
  });

  it("clears when saved empty", async () => {
    await savePrimaryProducer("Averatec");
    await savePrimaryProducer("");
    expect(await loadPrimaryProducer()).toBe("");
  });
});
