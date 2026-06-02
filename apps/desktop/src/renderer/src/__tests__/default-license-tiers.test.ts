import { describe, it, expect, vi, beforeEach } from "vitest";

const tiers = [
  { name: "MP3", deliverables: ["mp3"], prices: { CNY: 128 }, share: 25 },
  { name: "WAV", deliverables: ["wav"], prices: { CNY: 188 }, share: 15 },
];

vi.mock("@/api/app-settings", () => ({
  appSettings: { get: vi.fn(async () => ({ key: "default_license_tiers", value: tiers })) },
}));
const createMock = vi.fn();
vi.mock("@/api/license-tiers", () => ({
  licenseTiers: { create: (...a: unknown[]) => createMock(...a) },
}));
const showMock = vi.fn();
vi.mock("@/stores/toast", () => ({ useToastStore: { getState: () => ({ show: showMock }) } }));

import { applyDefaultLicenseTiers } from "@/lib/default-license-tiers";

describe("applyDefaultLicenseTiers", () => {
  beforeEach(() => {
    createMock.mockReset();
    showMock.mockReset();
  });

  it("posts every default tier (incl. share) to the track", async () => {
    createMock.mockResolvedValue({});
    await applyDefaultLicenseTiers(7);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock).toHaveBeenCalledWith(7, tiers[0]);
    expect(createMock.mock.calls[0][1].share).toBe(25);
    expect(showMock).not.toHaveBeenCalled();
  });

  it("skips a duplicate-deliverables rejection without an error toast", async () => {
    createMock
      .mockRejectedValueOnce(
        new Error("POST failed: 409 — A tier with the same deliverables already exists (id=3)"),
      )
      .mockResolvedValueOnce({});
    await applyDefaultLicenseTiers(7);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(showMock).not.toHaveBeenCalled();
  });

  it("shows one error toast on a genuine failure", async () => {
    createMock.mockRejectedValue(new Error("POST failed: 500 — boom"));
    await applyDefaultLicenseTiers(7);
    expect(showMock).toHaveBeenCalledTimes(2);
    expect(showMock.mock.calls[0][0]).toBe("error");
  });
});
