import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SearchInput } from "@/components/SearchInput";
import { useSearchStore } from "@/stores/search";

describe("SearchInput", () => {
  it("opens on icon click and writes to the store", async () => {
    useSearchStore.setState({ query: "" });
    render(<SearchInput />);
    await userEvent.click(screen.getByLabelText(/Search/i));
    const input = screen.getByPlaceholderText(/Search title/i);
    await userEvent.type(input, "trap");
    expect(useSearchStore.getState().query).toBe("trap");
  });

  it("ESC clears query and closes", async () => {
    useSearchStore.setState({ query: "x" });
    render(<SearchInput />);
    await userEvent.click(screen.getByLabelText(/Search/i));
    await userEvent.keyboard("{Escape}");
    expect(useSearchStore.getState().query).toBe("");
  });
});
