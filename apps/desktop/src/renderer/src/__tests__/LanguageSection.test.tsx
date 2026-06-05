import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/app-settings", () => ({
  appSettings: {
    get: vi.fn().mockResolvedValue({ key: "app_language", value: null }),
    set: vi.fn().mockResolvedValue({ key: "app_language", value: "en" }),
  },
}));

import { LanguageSection } from "@/components/Settings/LanguageSection";
import { useAppLanguageStore } from "@/stores/app-language";

describe("LanguageSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useAppLanguageStore.setState({ language: "en" });
  });

  it("renders both language options in their own script", () => {
    render(<LanguageSection />);
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "中文" })).toBeInTheDocument();
  });

  it("selecting 中文 switches the app language", async () => {
    const setLanguageMock = vi.fn().mockResolvedValue(undefined);
    useAppLanguageStore.setState({ setLanguage: setLanguageMock } as any);
    const user = userEvent.setup();
    render(<LanguageSection />);
    await user.click(screen.getByRole("button", { name: "中文" }));
    expect(setLanguageMock).toHaveBeenCalledWith("zh");
  });
});
