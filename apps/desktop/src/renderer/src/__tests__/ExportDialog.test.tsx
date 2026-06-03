import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ExportDialog } from "@/components/ExportDialog";
import { exportApi } from "@/api/export";
import { useProStore } from "@/stores/pro";

describe("ExportDialog", () => {
  beforeEach(() => {
    vi.spyOn(exportApi, "platforms").mockResolvedValue({ platforms: ["netease"] });
    vi.spyOn(exportApi, "forTrack").mockResolvedValue({
      platform: "netease",
      fields: [
        { key: "title", label: "标题", value: "My Beat", options: [], note: null },
        { key: "genre", label: "流派", value: "陷阱说唱", options: [], note: null },
      ],
    });
    useProStore.setState({ publishAvailable: false, loaded: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useProStore.setState({ publishAvailable: false, loaded: false });
  });

  it("renders fields and copies a field value", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(<ExportDialog open trackId={1} onClose={() => {}} />);

    await waitFor(() => screen.getByText("陷阱说唱"));
    const copyButtons = await screen.findAllByRole("button", { name: /复制|copy/i });
    await user.click(copyButtons[0]);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("My Beat"));
  });

  it("greys out the publish button when Pro is absent", async () => {
    render(<ExportDialog open trackId={1} onClose={() => {}} />);

    const publish = await screen.findByRole("button", { name: /发布到平台/ });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAttribute("title", "Pro 功能 · 购买解锁");
  });

  it("enables the publish button when Pro is present", async () => {
    useProStore.setState({ publishAvailable: true, loaded: true });
    render(<ExportDialog open trackId={1} onClose={() => {}} />);

    await waitFor(() => screen.getByText("陷阱说唱"));
    const publish = await screen.findByRole("button", { name: /发布到平台/ });
    expect(publish).toBeEnabled();
  });
});
