import { render, screen } from "@testing-library/react";
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

import { PublishCenterPanel } from "@/routes/PublishCenterPanel";
import { usePublishCenterStore } from "@/stores/publish-center";

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
  });

  it("renders session + activity headers and the empty job state", async () => {
    render(
      <MemoryRouter>
        <PublishCenterPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Account sessions/)).toBeInTheDocument();
    expect(screen.getByText(/Activity/)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(50);
    expect(screen.getByText(/No publishes in progress/)).toBeInTheDocument();
  });
});
