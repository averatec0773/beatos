import { afterEach, describe, expect, it, vi } from "vitest";

import { useAppLanguageStore } from "@/stores/app-language";
import { appSettings } from "@/api/app-settings";
import i18n from "@/i18n";

describe("app-language store", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage("en");
    useAppLanguageStore.setState({ language: "en" });
  });

  it("setLanguage updates i18next and persists", async () => {
    const set = vi
      .spyOn(appSettings, "set")
      .mockResolvedValue({ key: "app_language", value: "zh" });
    await useAppLanguageStore.getState().setLanguage("zh");
    expect(useAppLanguageStore.getState().language).toBe("zh");
    expect(i18n.language).toBe("zh");
    expect(set).toHaveBeenCalledWith("app_language", "zh");
  });

  it("hydrate applies a persisted language", async () => {
    vi.spyOn(appSettings, "get").mockResolvedValue({ key: "app_language", value: "zh" });
    await useAppLanguageStore.getState().hydrate();
    expect(useAppLanguageStore.getState().language).toBe("zh");
    expect(i18n.language).toBe("zh");
  });

  it("hydrate falls back to en for unknown values", async () => {
    vi.spyOn(appSettings, "get").mockResolvedValue({ key: "app_language", value: "fr" as never });
    await useAppLanguageStore.getState().hydrate();
    expect(useAppLanguageStore.getState().language).toBe("en");
    expect(i18n.language).toBe("en");
  });

  it("hydrate resets to en on first boot (null value), even from a stale in-memory zh", async () => {
    vi.spyOn(appSettings, "get").mockResolvedValue({ key: "app_language", value: null });
    useAppLanguageStore.setState({ language: "zh" }); // stale in-memory value
    await useAppLanguageStore.getState().hydrate();
    expect(useAppLanguageStore.getState().language).toBe("en");
    expect(i18n.language).toBe("en");
  });
});
