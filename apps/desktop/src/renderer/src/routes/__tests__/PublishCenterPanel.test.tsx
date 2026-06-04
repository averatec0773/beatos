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

describe("PublishCenterPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    usePublishCenterStore.setState({ sessions: {}, jobs: [], validating: false });
  });

  it("renders session + activity headers and the empty job state", async () => {
    render(
      <MemoryRouter>
        <PublishCenterPanel />
      </MemoryRouter>,
    );
    expect(screen.getByText(/账号会话/)).toBeInTheDocument();
    expect(screen.getByText(/实时任务/)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(50);
    expect(screen.getByText(/当前没有进行中的发布/)).toBeInTheDocument();
  });
});
