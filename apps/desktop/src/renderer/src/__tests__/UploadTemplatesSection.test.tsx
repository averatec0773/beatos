import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/app-settings", () => ({
  appSettings: {
    get: vi.fn().mockResolvedValue({ key: "upload_templates", value: null }),
    set: vi.fn().mockResolvedValue({ key: "upload_templates", value: {} }),
  },
}));

import { appSettings } from "@/api/app-settings";
import { useUploadTemplatesStore, DEFAULT_TEMPLATES } from "@/stores/upload-templates";
import { UploadTemplatesSection } from "@/components/Settings/UploadTemplatesSection";

const setMock = appSettings.set as unknown as ReturnType<typeof vi.fn>;

describe("UploadTemplatesSection", () => {
  beforeEach(() => {
    useUploadTemplatesStore.setState({ templates: { ...DEFAULT_TEMPLATES } });
    setMock.mockClear();
  });

  it("renders the three templates + prod with current values", () => {
    render(<UploadTemplatesSection />);
    expect(screen.getByLabelText("专辑名模板")).toHaveValue(DEFAULT_TEMPLATES.album_name);
    expect(screen.getByLabelText("Beat 名称模板")).toHaveValue(DEFAULT_TEMPLATES.beat_name);
    expect(screen.getByLabelText("制作人署名")).toHaveValue(DEFAULT_TEMPLATES.prod);
  });

  it("editing a template persists to app_setting", async () => {
    const user = userEvent.setup();
    render(<UploadTemplatesSection />);
    const input = screen.getByLabelText("Beat 名称模板");
    await user.clear(input);
    await user.type(input, "X");
    const lastCall = setMock.mock.calls.at(-1);
    expect(lastCall?.[0]).toBe("upload_templates");
    expect((lastCall?.[1] as { beat_name: string }).beat_name).toContain("X");
  });

  it("reset restores defaults", async () => {
    const user = userEvent.setup();
    act(() => useUploadTemplatesStore.setState({ templates: { ...DEFAULT_TEMPLATES, prod: "changed" } }));
    render(<UploadTemplatesSection />);
    await user.click(screen.getByRole("button", { name: "重置默认" }));
    expect(useUploadTemplatesStore.getState().templates.prod).toBe(DEFAULT_TEMPLATES.prod);
    expect(setMock).toHaveBeenCalledWith("upload_templates", DEFAULT_TEMPLATES);
  });
});
