import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/license-tiers", () => ({
  licenseTiers: {
    listForTrack: vi.fn().mockResolvedValue([
      {
        id: 1,
        track_id: 1,
        position: 0,
        name: "MP3",
        deliverables: ["mp3"],
        prices: { CNY: 50 },
        notes: null,
        share: null,
      },
    ]),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn(),
    remove: vi.fn(),
    reorder: vi.fn(),
  },
}));

import { licenseTiers } from "@/api/license-tiers";
import { LicenseTiersSection } from "@/components/TrackEditor/LicenseTiersSection";

const updateMock = licenseTiers.update as unknown as ReturnType<typeof vi.fn>;

describe("LicenseTiersSection share input", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    updateMock.mockClear();
  });

  it("edits share and persists it as a number", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LicenseTiersSection trackId={1} isFree={false} />);
    const inputs = await screen.findAllByLabelText(/分成/);
    // first 分成 input belongs to the filled MP3 tier
    await user.type(inputs[0], "25");
    await vi.advanceTimersByTimeAsync(800);
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const lastArg = updateMock.mock.calls.at(-1)?.[1];
    expect(lastArg.share).toBe(25);
  });

  it("typing share into an unpriced preset row creates a tier carrying that share", async () => {
    const createMock = licenseTiers.create as unknown as ReturnType<typeof vi.fn>;
    createMock.mockClear();
    createMock.mockResolvedValue({
      id: 2,
      track_id: 1,
      position: 1,
      name: "WAV",
      deliverables: ["wav"],
      prices: {},
      notes: null,
      share: 30,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LicenseTiersSection trackId={1} isFree={false} />);
    // empty preset rows (WAV/STEMS) now expose a 分成 input too — there are 3 total
    const inputs = await screen.findAllByLabelText(/分成/);
    expect(inputs.length).toBe(3); // MP3 (filled) + WAV + STEMS (empty)
    await user.type(inputs[1], "30"); // WAV empty row
    await vi.advanceTimersByTimeAsync(800);
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const createArg = createMock.mock.calls.at(-1)?.[1];
    expect(createArg.share).toBe(30);
    expect(createArg.deliverables).toEqual(["wav"]);
  });

  it("a custom tier created via Add tier carries its share", async () => {
    const createMock = licenseTiers.create as unknown as ReturnType<typeof vi.fn>;
    createMock.mockClear();
    createMock.mockResolvedValue({
      id: 3,
      track_id: 1,
      position: 2,
      name: "MIDI",
      deliverables: ["midi"],
      prices: {},
      notes: null,
      share: 40,
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<LicenseTiersSection trackId={1} isFree={false} />);
    await screen.findByText("MP3"); // loaded
    await user.click(screen.getByText("Add tier"));
    await user.type(screen.getByLabelText("Tier name"), "MIDI");
    // the pending custom row now has its own 分成 input — the last one
    const shareInputs = screen.getAllByLabelText(/分成/);
    await user.type(shareInputs[shareInputs.length - 1], "40");
    await user.keyboard("{Enter}"); // commit
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const arg = createMock.mock.calls.at(-1)?.[1];
    expect(arg.share).toBe(40);
    expect(arg.deliverables).toEqual(["midi"]);
  });
});
