import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ExportDialog } from "@/components/ExportDialog";
import { exportApi } from "@/api/export";

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
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders fields and copies a field value", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    render(<ExportDialog open trackId={1} onClose={() => {}} />);

    await waitFor(() => screen.getByText("陷阱说唱"));
    const copyButtons = await screen.findAllByRole("button", { name: /复制|copy/i });
    await user.click(copyButtons[0]);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("My Beat"));
  });
});
