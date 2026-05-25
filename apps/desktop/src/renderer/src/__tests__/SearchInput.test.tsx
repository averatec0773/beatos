import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SearchInput } from "@/components/SearchInput";
import { useTrackQueryStore } from "@/stores/track-query";

describe("SearchInput", () => {
  it("opens on icon click and writes to the store", async () => {
    useTrackQueryStore.setState({ q: "" });
    render(<SearchInput />);
    await userEvent.click(screen.getByLabelText(/Search/i));
    const input = screen.getByPlaceholderText(/Search title/i);
    await userEvent.type(input, "trap");
    expect(useTrackQueryStore.getState().q).toBe("trap");
  });

  it("ESC clears query and closes", async () => {
    useTrackQueryStore.setState({ q: "x" });
    render(<SearchInput />);
    await userEvent.click(screen.getByLabelText(/Search/i));
    await userEvent.keyboard("{Escape}");
    expect(useTrackQueryStore.getState().q).toBe("");
  });
});
