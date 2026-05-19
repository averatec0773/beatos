import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApprovalsPanel } from "@/routes/ApprovalsPanel";

const FAKE_BASE = "http://127.0.0.1:5555";

vi.mock("@/hooks/use-api-base", () => ({
  useApiBase: () => FAKE_BASE,
}));

vi.mock("@/stores/lists", () => ({
  useListStore: {
    getState: () => ({ refresh: vi.fn().mockResolvedValue(undefined) }),
  },
}));

function mockTokensApi(pending: any[], history: any[]) {
  (global.fetch as any) = vi.fn((url: string) => {
    if (url.endsWith("status=pending")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(pending) });
    }
    if (url.endsWith("status=history")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(history) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

const pendingRow = {
  token: "p1",
  tool_name: "create_list",
  payload: { name: "Trap 2026" },
  created_at: Date.now() / 1000 - 12,
  expires_at: Date.now() / 1000 + 288,
};

const consumedRow = {
  token: "c1",
  tool_name: "create_list",
  payload: { name: "Lo-fi" },
  created_at: Date.now() / 1000 - 200,
  expires_at: Date.now() / 1000 - 50,
  status: "consumed",
  consumed_at: Date.now() / 1000 - 100,
  result: { list_id: 7 },
};

const rejectedRow = { ...consumedRow, token: "r1", status: "rejected", result: null };
const expiredRow = { ...consumedRow, token: "e1", status: "expired", result: null };

describe("ApprovalsPanel", () => {
  beforeEach(() => { mockTokensApi([], []); });

  it("renders the empty-empty state when both sections are empty", async () => {
    mockTokensApi([], []);
    render(<MemoryRouter><ApprovalsPanel /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/No AI activity yet/i)).toBeInTheDocument();
    });
  });

  it("renders Pending section when pending tokens exist", async () => {
    mockTokensApi([pendingRow], []);
    render(<MemoryRouter><ApprovalsPanel /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Pending \(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Trap 2026/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    });
  });

  it("renders Recent section with status glyphs", async () => {
    mockTokensApi([], [consumedRow, rejectedRow, expiredRow]);
    render(<MemoryRouter><ApprovalsPanel /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Recent \(3\)/i)).toBeInTheDocument();
    });
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(screen.getByText("✗")).toBeInTheDocument();
    expect(screen.getByText("⌛")).toBeInTheDocument();
  });

  it("Approve button calls approve endpoint", async () => {
    mockTokensApi([pendingRow], []);
    render(<MemoryRouter><ApprovalsPanel /></MemoryRouter>);
    const btn = await screen.findByRole("button", { name: /approve/i });
    (global.fetch as any).mockClear();
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await userEvent.click(btn);
    expect(global.fetch).toHaveBeenCalledWith(
      `${FAKE_BASE}/api/tokens/p1/approve`,
      { method: "POST" },
    );
  });

  it("Reject button calls reject endpoint", async () => {
    mockTokensApi([pendingRow], []);
    render(<MemoryRouter><ApprovalsPanel /></MemoryRouter>);
    const btn = await screen.findByRole("button", { name: /reject/i });
    (global.fetch as any).mockClear();
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await userEvent.click(btn);
    expect(global.fetch).toHaveBeenCalledWith(
      `${FAKE_BASE}/api/tokens/p1/reject`,
      { method: "POST" },
    );
  });

  it("hides Pending header when pending list is empty (history-only)", async () => {
    mockTokensApi([], [consumedRow]);
    render(<MemoryRouter><ApprovalsPanel /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Recent \(1\)/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Pending \(/i)).toBeNull();
  });

  it("hides Recent header when history is empty (pending-only)", async () => {
    mockTokensApi([pendingRow], []);
    render(<MemoryRouter><ApprovalsPanel /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Pending \(1\)/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Recent \(/i)).toBeNull();
  });
});
