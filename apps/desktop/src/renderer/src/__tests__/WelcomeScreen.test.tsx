import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WelcomeScreen } from "@/routes/WelcomeScreen";
import { useLibraryStore } from "@/stores/library";

describe("WelcomeScreen", () => {
  it("triggers folder picker and init on 'Choose Library Folder'", async () => {
    const init = vi.fn().mockResolvedValue(undefined);
    useLibraryStore.setState({ init });
    (window.beatos.openFolderDialog as any) = vi.fn().mockResolvedValue("/tmp/MyLib");

    render(<WelcomeScreen />);
    await userEvent.click(screen.getByRole("button", { name: /Choose Library Folder/i }));

    expect(init).toHaveBeenCalledWith("/tmp/MyLib");
  });
});
