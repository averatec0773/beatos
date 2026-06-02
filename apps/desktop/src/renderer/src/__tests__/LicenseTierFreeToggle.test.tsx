import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/license-tiers", () => ({
  licenseTiers: {
    listForTrack: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reorder: vi.fn(),
  },
}));
const updateMock = vi.fn(async () => ({}));
vi.mock("@/stores/tracks", () => ({
  useTrackStore: { getState: () => ({ update: updateMock }) },
}));

import { LicenseTiersSection } from "@/components/TrackEditor/LicenseTiersSection";

describe("LicenseTiersSection free toggle", () => {
  beforeEach(() => {
    updateMock.mockClear();
  });

  it("toggling 免费 patches is_free", async () => {
    const user = userEvent.setup();
    render(<LicenseTiersSection trackId={9} isFree={false} />);
    const sw = await screen.findByLabelText(/免费/);
    await user.click(sw);
    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(9, { is_free: true }));
  });
});
