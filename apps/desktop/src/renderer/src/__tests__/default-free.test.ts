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
const updateMock = vi.fn(async (_id: unknown, _payload: unknown) => ({}));
vi.mock("@/api/tracks", () => ({
  tracks: { update: (id: unknown, payload: unknown) => updateMock(id, payload) },
}));

import { loadDefaultIsFree, saveDefaultIsFree, applyDefaultIsFree } from "@/lib/default-free";

describe("default-free", () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    updateMock.mockClear();
  });

  it("defaults to true when unset (shipped preset)", async () => {
    expect(await loadDefaultIsFree()).toBe(true);
  });
  it("round-trips the setting", async () => {
    await saveDefaultIsFree(false);
    expect(await loadDefaultIsFree()).toBe(false);
    await saveDefaultIsFree(true);
    expect(await loadDefaultIsFree()).toBe(true);
  });
  it("applyDefaultIsFree PATCHes is_free=true when default is true", async () => {
    await saveDefaultIsFree(true);
    await applyDefaultIsFree(7);
    expect(updateMock).toHaveBeenCalledWith(7, { is_free: true });
  });
  it("applyDefaultIsFree does nothing when default is explicitly false", async () => {
    await saveDefaultIsFree(false);
    await applyDefaultIsFree(7);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
