import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/license-tiers", () => ({
  licenseTiers: {
    listForTrack: vi.fn().mockResolvedValue([
      { id: 1, track_id: 1, position: 0, name: "MP3", deliverables: ["mp3"], prices: { CNY: 50 }, notes: null, share: null },
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
    render(<LicenseTiersSection trackId={1} />);
    const input = await screen.findByLabelText(/分成/);
    await user.type(input, "25");
    await vi.advanceTimersByTimeAsync(800);
    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    const lastArg = updateMock.mock.calls.at(-1)?.[1];
    expect(lastArg.share).toBe(25);
  });
});
