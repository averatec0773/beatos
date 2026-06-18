import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApprovalsPanel } from "@/routes/ApprovalsPanel";

const FAKE_BASE = "http://127.0.0.1:5555";

vi.mock("@/hooks/use-api-base", () => ({
  useApiBase: () => FAKE_BASE,
}));

function mockActions(actions: any[]) {
  (global.fetch as any) = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ actions }) }),
  );
}

const appliedAction = {
  ts: Date.now() / 1000 - 30,
  tool_name: "trash_tracks",
  summary: { headline: "Trashed 3 tracks" },
  client_name: "Claude Desktop",
  status: "applied",
  result: { trashed: 3 },
};

const failedAction = {
  ts: Date.now() / 1000 - 120,
  tool_name: "attach_assets",
  summary: { headline: "Attach failed" },
  client_name: "Claude Desktop",
  status: "failed",
  result: "error",
};

const refusedAction = {
  ts: Date.now() / 1000 - 200,
  tool_name: "create_tracks",
  summary: {},
  client_name: "Cursor",
  status: "refused_read_only",
  result: "read-only",
};

describe("ApprovalsPanel", () => {
  beforeEach(() => {
    mockActions([]);
  });

  it("renders the empty state when there is no activity", async () => {
    mockActions([]);
    render(
      <MemoryRouter>
        <ApprovalsPanel />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No AI activity yet/i)).toBeInTheDocument();
    });
  });

  it("renders the Recent section with an action headline", async () => {
    mockActions([appliedAction]);
    render(
      <MemoryRouter>
        <ApprovalsPanel />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Recent \(1\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Trashed 3 tracks")).toBeInTheDocument();
  });

  it("renders status glyphs and falls back to the tool name", async () => {
    mockActions([appliedAction, failedAction, refusedAction]);
    render(
      <MemoryRouter>
        <ApprovalsPanel />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Recent \(3\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getByText("✗")).toBeInTheDocument();
    expect(screen.getByText("⊘")).toBeInTheDocument();
    // No headline → tool_name is rendered directly.
    expect(screen.getByText("create_tracks")).toBeInTheDocument();
  });
});
