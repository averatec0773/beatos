import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/publish", () => ({
  publishApi: {
    sessions: vi.fn().mockResolvedValue({ sessions: { netease: false } }),
    validateSessions: vi.fn().mockResolvedValue({ sessions: { netease: "not_logged_in" } }),
    jobs: vi.fn().mockResolvedValue({ jobs: [] }),
    login: vi.fn(),
    loginStatus: vi.fn(),
  },
}));

// Stub the heavy children — covered by their own tests.
vi.mock("@/components/PublishDialog", () => ({ PublishDialog: () => null }));
vi.mock("@/components/PublishCenter/PublishTrackPicker", () => ({
  PublishTrackPicker: () => null,
}));

import { PublishCenterPanel } from "@/routes/PublishCenterPanel";
import { usePublishCenterStore } from "@/stores/publish-center";
import { useProStore } from "@/stores/pro";
import { publishApi } from "@/api/publish";

// In-memory localStorage (jsdom's here lacks a usable clear()).
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

describe("PublishCenterPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.clear();
    usePublishCenterStore.setState({ sessions: {}, validatedAt: {}, jobs: [], validating: false });
    // Default to the Pro build (publish available) for the existing test.
    useProStore.setState({ publishAvailable: true, loaded: true });
    vi.mocked(publishApi.sessions).mockClear();
  });

  it("renders session + activity headers and the empty job state", async () => {
    render(
      <MemoryRouter>
        <PublishCenterPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Account sessions/)).toBeInTheDocument();
    expect(screen.getByText(/Activity/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publish a track/ })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(50);
    expect(screen.getByText(/No publishes in progress/)).toBeInTheDocument();
  });

  it("shows a Pro upsell (and fires no publish APIs) in the free build", async () => {
    useProStore.setState({ publishAvailable: false, loaded: true });
    render(
      <MemoryRouter>
        <PublishCenterPanel />
      </MemoryRouter>,
    );
    // Upsell copy, not the live panel.
    expect(screen.getByText(/BeatOS Pro feature/)).toBeInTheDocument();
    expect(screen.queryByText(/Account sessions/)).not.toBeInTheDocument();
    // The guarded effect must not have probed the publish backend.
    await vi.advanceTimersByTimeAsync(50);
    expect(publishApi.sessions).not.toHaveBeenCalled();
  });

  it("flips the session row to Logged in on login success, independent of the re-probe", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTimeAsync });
    vi.mocked(publishApi.login).mockResolvedValue({ login_id: "L1" });
    vi.mocked(publishApi.loginStatus).mockResolvedValue({ status: "success", message: "" });
    // The cold post-login re-probe can racily report not_logged_in (e.g. BeatStars'
    // login→OAuth redirect). The row must flip on login success itself, NOT depend
    // on this probe — so even with a not_logged_in re-probe it shows Logged in.
    vi.mocked(publishApi.validateSessions).mockResolvedValue({
      sessions: { netease: "not_logged_in" },
    });

    render(
      <MemoryRouter>
        <PublishCenterPanel />
      </MemoryRouter>,
    );
    await vi.advanceTimersByTimeAsync(50);

    await user.click(screen.getByRole("button", { name: /^Log in$/i }));
    // The login-status poll runs on a 2s interval.
    await vi.advanceTimersByTimeAsync(2100);

    // Valid state: the row's action button becomes "Re-login".
    expect(screen.getByRole("button", { name: /Re-login/i })).toBeInTheDocument();
  });
});
