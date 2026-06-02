import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
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

  it("renders the four templates with current values", () => {
    render(<UploadTemplatesSection />);
    expect(screen.getByLabelText("专辑名模板")).toHaveValue(DEFAULT_TEMPLATES.album_name);
    expect(screen.getByLabelText("Beat 名称模板")).toHaveValue(DEFAULT_TEMPLATES.beat_name);
    expect(screen.getByLabelText("Beat 说明模板")).toHaveValue(DEFAULT_TEMPLATES.beat_description);
    expect(screen.getByLabelText("专辑描述模板")).toHaveValue(DEFAULT_TEMPLATES.album_description);
    expect(screen.getByLabelText("制作人连接符")).toHaveValue(DEFAULT_TEMPLATES.prod_separator);
    expect(screen.queryByLabelText("制作人署名")).toBeNull();
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

  it("editing the separator persists", async () => {
    const user = userEvent.setup();
    render(<UploadTemplatesSection />);
    const input = screen.getByLabelText("制作人连接符");
    await user.clear(input);
    await user.type(input, " & ");
    const lastCall = setMock.mock.calls.at(-1);
    expect((lastCall?.[1] as { prod_separator: string }).prod_separator).toContain("&");
  });

  it("edits the free prefix template field", async () => {
    const user = userEvent.setup();
    render(<UploadTemplatesSection />);
    const input = await screen.findByLabelText("免费前缀");
    await user.clear(input);
    await user.type(input, "【免费】");
    await waitFor(() => expect(screen.getByLabelText("免费前缀")).toHaveValue("【免费】"));
  });

  it("reset restores defaults", async () => {
    const user = userEvent.setup();
    act(() =>
      useUploadTemplatesStore.setState({
        templates: { ...DEFAULT_TEMPLATES, prod_separator: " & " },
      }),
    );
    render(<UploadTemplatesSection />);
    await user.click(screen.getByRole("button", { name: "重置默认" }));
    expect(useUploadTemplatesStore.getState().templates.prod_separator).toBe(
      DEFAULT_TEMPLATES.prod_separator,
    );
    expect(setMock).toHaveBeenCalledWith("upload_templates", DEFAULT_TEMPLATES);
  });
});
