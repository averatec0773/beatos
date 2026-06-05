import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, afterEach } from "vitest";

import { BulkEditDialog } from "@/components/BulkEditDialog";
import { bulk } from "@/api/bulk";
import { useTrackStore } from "@/stores/tracks";

describe("BulkEditDialog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends an add-mode genre patch for the selected ids", async () => {
    const update = vi.spyOn(bulk, "update").mockResolvedValue({ updated_count: 2, ids: [1, 2] });
    useTrackStore.setState({ refresh: vi.fn().mockResolvedValue(undefined) } as any);

    const user = userEvent.setup();

    render(<BulkEditDialog open ids={[1, 2]} onClose={() => {}} onDone={() => {}} />);

    // Open the Genre ChipMultiSelect popover — trigger button shows "Add genre..."
    await user.click(screen.getByRole("button", { name: /add genre/i }));

    // The genre option label for "Trap Rap" is "陷阱说唱 (Trap Rap)" per genreLabel()
    // Click the label text to toggle the checkbox
    await user.click(await screen.findByText(/陷阱说唱 \(Trap Rap\)/i));

    // Confirm selection inside the popover with the "Apply" button
    await user.click(screen.getByRole("button", { name: /^apply$/i }));

    // Click the main dialog apply button
    await user.click(screen.getByRole("button", { name: /apply to 2/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith([1, 2], { genre: { add: ["Trap Rap"] } }),
    );
  });
});
