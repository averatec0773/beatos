import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/app-settings", () => ({
  appSettings: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { appSettings } from "@/api/app-settings";
import { useVocabLocaleStore } from "@/stores/vocab-locale";

const getMock = appSettings.get as unknown as ReturnType<typeof vi.fn>;
const setMock = appSettings.set as unknown as ReturnType<typeof vi.fn>;

describe("useVocabLocaleStore", () => {
  beforeEach(() => {
    useVocabLocaleStore.setState({ locale: "both" });
    getMock.mockReset();
    setMock.mockReset();
  });

  it("defaults to 'both'", () => {
    expect(useVocabLocaleStore.getState().locale).toBe("both");
  });

  it("hydrate() applies the persisted value", async () => {
    getMock.mockResolvedValue({ key: "vocab_locale", value: "zh" });
    await useVocabLocaleStore.getState().hydrate();
    expect(getMock).toHaveBeenCalledWith("vocab_locale");
    expect(useVocabLocaleStore.getState().locale).toBe("zh");
  });

  it("hydrate() with null value keeps 'both'", async () => {
    getMock.mockResolvedValue({ key: "vocab_locale", value: null });
    await useVocabLocaleStore.getState().hydrate();
    expect(useVocabLocaleStore.getState().locale).toBe("both");
  });

  it("setLocale() updates state and persists", async () => {
    setMock.mockResolvedValue({ key: "vocab_locale", value: "en" });
    await useVocabLocaleStore.getState().setLocale("en");
    expect(useVocabLocaleStore.getState().locale).toBe("en");
    expect(setMock).toHaveBeenCalledWith("vocab_locale", "en");
  });
});
