import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/default-license-tiers", () => ({
  loadDefaultLicenseTiers: vi
    .fn()
    .mockResolvedValue([{ name: "MP3", deliverables: ["mp3"], prices: { CNY: 50 }, share: null }]),
  saveDefaultLicenseTiers: vi.fn().mockResolvedValue(undefined),
}));

import { loadDefaultLicenseTiers, saveDefaultLicenseTiers } from "@/lib/default-license-tiers";
import { DefaultLicenseTiersSection } from "@/components/Settings/DefaultLicenseTiersSection";

const loadMock = loadDefaultLicenseTiers as unknown as ReturnType<typeof vi.fn>;
const saveMock = saveDefaultLicenseTiers as unknown as ReturnType<typeof vi.fn>;

describe("DefaultLicenseTiersSection share input", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    loadMock.mockClear();
    saveMock.mockClear();
  });

  it("editing Share % persists share as a number in the saved template", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DefaultLicenseTiersSection />);

    const inputs = await screen.findAllByLabelText(/Share %/i);
    // MP3 row is the first (preset slot 0)
    await user.type(inputs[0], "30");
    await vi.advanceTimersByTimeAsync(800);

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const savedTemplates = saveMock.mock.calls.at(-1)?.[0] as {
      name?: string;
      share?: number | null;
    }[];
    const mp3Tpl = savedTemplates?.find((t) => t.name === "MP3");
    expect(mp3Tpl?.share).toBe(30);
  });

  it("loading a template with existing share populates the input", async () => {
    loadMock.mockResolvedValueOnce([
      { name: "WAV", deliverables: ["wav"], prices: { CNY: 80 }, share: 15 },
    ]);
    render(<DefaultLicenseTiersSection />);

    const inputs = await screen.findAllByLabelText(/Share %/i);
    // WAV is preset slot index 1 — find the one with value "15"
    const wavInput = inputs.find((el) => (el as HTMLInputElement).value === "15");
    expect(wavInput).toBeDefined();
  });

  it("clearing the share input saves null", async () => {
    loadMock.mockResolvedValueOnce([
      { name: "MP3", deliverables: ["mp3"], prices: { CNY: 50 }, share: 25 },
    ]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DefaultLicenseTiersSection />);

    const inputs = await screen.findAllByLabelText(/Share %/i);
    const mp3Input = inputs.find((el) => (el as HTMLInputElement).value === "25");
    expect(mp3Input).toBeDefined();
    await user.clear(mp3Input!);
    await vi.advanceTimersByTimeAsync(800);

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const savedTemplates = saveMock.mock.calls.at(-1)?.[0] as {
      name?: string;
      share?: number | null;
    }[];
    const mp3Tpl = savedTemplates?.find((t) => t.name === "MP3");
    expect(mp3Tpl?.share).toBeNull();
  });
});
