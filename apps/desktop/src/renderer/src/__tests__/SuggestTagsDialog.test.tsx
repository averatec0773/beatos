import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { SuggestTagsDialog } from "@/components/SuggestTagsDialog";

const suggestion = {
  genre: ["Trap"],
  mood: ["Dark"],
  tags: ["808"],
  description: "Dark trap.",
};

describe("SuggestTagsDialog", () => {
  it("applies every suggested field by default", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<SuggestTagsDialog open suggestion={suggestion} onApply={onApply} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /apply selected/i }));
    expect(onApply).toHaveBeenCalledWith({
      genre: ["Trap"],
      mood: ["Dark"],
      tags: ["808"],
      description: "Dark trap.",
    });
  });

  it("omits a field the user unchecks", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<SuggestTagsDialog open suggestion={suggestion} onApply={onApply} onClose={() => {}} />);
    // Checkbox order: genre, mood, tags, description. Uncheck genre.
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /apply selected/i }));
    expect(onApply).toHaveBeenCalledWith({
      mood: ["Dark"],
      tags: ["808"],
      description: "Dark trap.",
    });
  });

  it("shows the empty state and disables Apply when nothing was suggested", () => {
    render(
      <SuggestTagsDialog
        open
        suggestion={{ genre: [], mood: [], tags: [], description: null }}
        onApply={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /apply selected/i })).toBeDisabled();
  });
});
