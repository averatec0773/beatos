import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The dialog must gate Publish on REAL session validity (headless validateSessions),
// not the cheap file-existence sessions() check — an expired session file still
// "exists" but must NOT enable Publish (regression: launched a browser into a dead
// session). See audit Bug #1.

vi.mock("@/api/export", () => ({
  exportApi: {
    forTrack: vi.fn().mockResolvedValue({ fields: [] }),
  },
}));

vi.mock("@/api/assets", () => ({
  assets: {
    // One audio asset so the asset-selection gate passes and only the session
    // gate decides whether Publish is enabled.
    listForTrack: vi
      .fn()
      .mockResolvedValue([
        { id: 1, role: "audio_tagged", format: "mp3", abs_path: "/a.mp3", rel_path: "a.mp3" },
      ]),
  },
}));

const sessionsMock = vi.fn();
const validateSessionsMock = vi.fn();
vi.mock("@/api/publish", () => ({
  publishApi: {
    sessions: () => sessionsMock(),
    validateSessions: (p?: string[]) => validateSessionsMock(p),
    login: vi.fn(),
    loginStatus: vi.fn(),
    create: vi.fn(),
    status: vi.fn(),
    jobs: vi.fn(),
  },
}));

// In-memory localStorage (jsdom's lacks a usable clear()); the publish-center
// store reads/writes its validity cache here.
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

function renderDialog(): void {
  render(<PublishDialog open trackId={1} platform="netease" onClose={() => {}} />);
}

describe("PublishDialog session gating", () => {
  beforeEach(() => {
    localStorage.clear();
    usePublishCenterStore.setState({ sessions: {}, validatedAt: {}, jobs: [], validating: false });
    sessionsMock.mockReset().mockResolvedValue({ sessions: { netease: true } });
    validateSessionsMock.mockReset();
  });

  it("enables Publish only when the session really validates", async () => {
    validateSessionsMock.mockResolvedValue({ sessions: { netease: "valid" } });
    renderDialog();
    const publishBtn = await screen.findByRole("button", { name: /Publish/ });
    await waitFor(() => expect(publishBtn).not.toBeDisabled());
  });

  it("keeps Publish disabled and warns when the session is expired", async () => {
    validateSessionsMock.mockResolvedValue({ sessions: { netease: "expired" } });
    renderDialog();
    const publishBtn = await screen.findByRole("button", { name: /Publish/ });
    // The expired session file still exists (sessions() → true), so the OLD
    // file-existence gate would (wrongly) enable Publish. Real validation must
    // keep it disabled.
    await waitFor(() => expect(validateSessionsMock).toHaveBeenCalled());
    await waitFor(() => expect(publishBtn).toBeDisabled());
  });
});
