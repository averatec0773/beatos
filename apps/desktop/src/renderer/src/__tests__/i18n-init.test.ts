import { beforeEach, describe, expect, it } from "vitest";

import i18n from "@/i18n";

describe("i18n init", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });
  it("defaults to English and resolves a known key", () => {
    expect(i18n.language).toBe("en");
    expect(i18n.t("common.cancel")).toBe("Cancel");
  });

  it("switches to Chinese on changeLanguage", async () => {
    await i18n.changeLanguage("zh");
    expect(i18n.t("common.cancel")).toBe("取消");
    await i18n.changeLanguage("en"); // restore for later tests
  });
});
