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
    create: vi.fn().mockResolvedValue({
      id: 2,
      track_id: 1,
      position: 1,
      name: "WAV",
      deliverables: ["wav"],
      prices: { CNY: 300 },
      notes: null,
      share: null,
    }),
    remove: vi.fn(),
    reorder: vi.fn(),
  },
}));

import { licenseTiers } from "@/api/license-tiers";
import { LicenseTiersSection } from "@/components/TrackEditor/LicenseTiersSection";

const updateMock = licenseTiers.update as unknown as ReturnType<typeof vi.fn>;
const createMock = licenseTiers.create as unknown as ReturnType<typeof vi.fn>;

// Guard for the debounce-drop data-loss bug: edits still inside the 600ms
// autosave window were silently discarded when the editor unmounted (ESC /
// Close right after typing a price). Unmount must FLUSH pending writes.
describe("LicenseTiersSection pending-write flush", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    updateMock.mockClear();
    createMock.mockClear();
  });

  it("flushes a pending tier price save on unmount", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<LicenseTiersSection trackId={1} isFree={false} />);
    const cnyInputs = await screen.findAllByLabelText("CNY price");
    // first CNY input belongs to the filled MP3 tier
    await user.clear(cnyInputs[0]);
    await user.type(cnyInputs[0], "80");
    expect(updateMock).not.toHaveBeenCalled(); // still inside the debounce
    unmount();
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const [tierId, payload] = updateMock.mock.calls.at(-1)!;
    expect(tierId).toBe(1);
    expect(payload.prices.CNY).toBe(80);
  });

  it("flushes a pending empty-preset create on unmount", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<LicenseTiersSection trackId={1} isFree={false} />);
    const cnyInputs = await screen.findAllByLabelText("CNY price");
    // second CNY input is the empty WAV preset row
    await user.type(cnyInputs[1], "300");
    expect(createMock).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const [trackId, payload] = createMock.mock.calls.at(-1)!;
    expect(trackId).toBe(1);
    expect(payload.deliverables).toEqual(["wav"]);
    expect(payload.prices.CNY).toBe(300);
  });
});
