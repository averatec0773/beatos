import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Extension-mode publish entry (extension design P2): for BeatStars the dialog
// offers "Automation browser" (engine, default) vs "Browser extension". The
// extension path stages a ticket via mode:"extension", must NOT be blocked by
// the automation-session gate (it rides the user's own logged-in browser), and
// shows a staged-state panel with the platform upload-page link.

vi.mock("@/api/export", () => ({
  exportApi: {
    forTrack: vi.fn().mockResolvedValue({ fields: [] }),
  },
}));

vi.mock("@/api/assets", () => ({
  assets: {
    listForTrack: vi
      .fn()
      .mockResolvedValue([
        { id: 1, role: "audio_tagged", format: "mp3", abs_path: "/a.mp3", rel_path: "a.mp3" },
      ]),
  },
}));

const sessionsMock = vi.fn();
const validateSessionsMock = vi.fn();
const createMock = vi.fn();
const statusMock = vi.fn();
vi.mock("@/api/publish", () => ({
  publishApi: {
    sessions: () => sessionsMock(),
    validateSessions: (p?: string[]) => validateSessionsMock(p),
    login: vi.fn(),
    loginStatus: vi.fn(),
    create: (body: unknown) => createMock(body),
    status: (id: string) => statusMock(id),
    jobs: vi.fn(),
  },
}));

const _ls: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => (k in _ls ? _ls[k] : null),
  setItem: (k: string, v: string) => {
    _ls[k] = String(v);
  },
  removeItem: (k: string) => {
    delete _ls[k];
  },
  clear: () => {
    for (const k of Object.keys(_ls)) delete _ls[k];
  },
});

import { PublishDialog } from "@/components/PublishDialog";
import { usePublishCenterStore } from "@/stores/publish-center";

describe("PublishDialog extension mode", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    usePublishCenterStore.setState({ sessions: {}, validatedAt: {}, jobs: [], validating: false });
    sessionsMock.mockReset().mockResolvedValue({ sessions: { beatstars: true } });
    // Expired automation session: the ENGINE path would be blocked — proving
    // the extension path ignores the session gate.
    validateSessionsMock.mockReset().mockResolvedValue({ sessions: { beatstars: "expired" } });
    createMock.mockReset().mockResolvedValue({
      job_id: "t1",
      mode: "extension",
      upload_url: "https://www.beatstars.com/track/upload",
    });
    statusMock
      .mockReset()
      .mockResolvedValue({ job_id: "t1", stage: "staged", message: "waiting for extension" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers the method choice only for beatstars", async () => {
    const { unmount } = render(
      <PublishDialog open trackId={1} platform="netease" onClose={() => {}} />,
    );
    await screen.findByRole("button", { name: /Publish/ });
    expect(screen.queryByRole("radiogroup", { name: "Publish method" })).toBeNull();
    unmount();

    render(<PublishDialog open trackId={1} platform="beatstars" onClose={() => {}} />);
    await screen.findByRole("radiogroup", { name: "Publish method" });
    // Engine is the default.
    expect(screen.getByRole("radio", { name: "Automation browser" })).toBeChecked();
  });

  it("stages via mode:extension despite an expired automation session and shows the staged panel", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PublishDialog open trackId={1} platform="beatstars" onClose={() => {}} />);
    const publishBtn = await screen.findByRole("button", { name: /Publish/ });

    // Engine path is blocked by the expired session…
    await waitFor(() => expect(validateSessionsMock).toHaveBeenCalled());
    await waitFor(() => expect(publishBtn).toBeDisabled());

    // …but switching to the extension enables Publish (own-browser login).
    await user.click(screen.getByRole("radio", { name: "Browser extension" }));
    await waitFor(() => expect(publishBtn).not.toBeDisabled());

    await user.click(publishBtn);
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ track_id: 1, platform: "beatstars", mode: "extension" }),
    );

    // The status poll (1.5s interval) reports the staged ticket → panel shows
    // the hand-off message + the platform-page link.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    await screen.findByText(/Ticket staged/);
    const link = screen.getByRole("link", { name: "Open platform page" });
    expect(link).toHaveAttribute("href", "https://www.beatstars.com/track/upload");
  });
});
