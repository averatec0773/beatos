import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/app-settings", () => ({
  appSettings: {
    get: vi.fn().mockResolvedValue({ key: "vocab_locale", value: null }),
    set: vi.fn().mockResolvedValue({ key: "vocab_locale", value: "zh" }),
  },
}));

import { appSettings } from "@/api/app-settings";
import { useVocabLocaleStore } from "@/stores/vocab-locale";
import { VocabLocaleSection } from "@/components/Settings/VocabLocaleSection";

const setMock = appSettings.set as unknown as ReturnType<typeof vi.fn>;

describe("VocabLocaleSection", () => {
  beforeEach(() => {
    useVocabLocaleStore.setState({ locale: "both" });
    setMock.mockClear();
  });

  it("highlights the active locale", () => {
    act(() => useVocabLocaleStore.setState({ locale: "zh" }));
    render(<VocabLocaleSection />);
    expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("clicking a locale persists and updates the store", async () => {
    const user = userEvent.setup();
    render(<VocabLocaleSection />);
    await user.click(screen.getByRole("button", { name: "中文" }));
    expect(setMock).toHaveBeenCalledWith("vocab_locale", "zh");
    expect(useVocabLocaleStore.getState().locale).toBe("zh");
  });
});
