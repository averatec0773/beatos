import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { OnboardingDriver } from "@/routes/OnboardingDriver";
import { useLibraryStore } from "@/stores/library";

describe("OnboardingDriver", () => {
  it("calls openFolderDialog on mount and quits when canceled", async () => {
    const quit = vi.fn().mockResolvedValue(undefined);
    const openDialog = vi.fn().mockResolvedValue(null);
    (window.beatos as unknown as Record<string, unknown>).openFolderDialog = openDialog;
    (window.beatos as unknown as Record<string, unknown>).quitApp = quit;

    render(
      <MemoryRouter>
        <OnboardingDriver />
      </MemoryRouter>
    );

    await waitFor(() => expect(openDialog).toHaveBeenCalled());
    await waitFor(() => expect(quit).toHaveBeenCalled());
  });

  it("calls init on chosen path", async () => {
    const init = vi.fn().mockResolvedValue(undefined);
    useLibraryStore.setState({ init });
    (window.beatos as unknown as Record<string, unknown>).openFolderDialog = vi
      .fn()
      .mockResolvedValue("/tmp/Lib");

    render(
      <MemoryRouter>
        <OnboardingDriver />
      </MemoryRouter>
    );

    await waitFor(() => expect(init).toHaveBeenCalledWith("/tmp/Lib"));
  });
});
