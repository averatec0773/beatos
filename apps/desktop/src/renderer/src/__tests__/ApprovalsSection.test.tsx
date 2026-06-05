import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApprovalsSection } from "@/components/Sidebar/ApprovalsSection";

const FAKE_BASE = "http://127.0.0.1:5555";

vi.mock("@/hooks/use-api-base", () => ({ useApiBase: () => FAKE_BASE }));
vi.mock("@/stores/lists", () => ({
  useListStore: { getState: () => ({ refresh: vi.fn().mockResolvedValue(undefined) }) },
}));

function mockPending(rows: any[]) {
  (global.fetch as any) = vi.fn((url: string) => {
    if (url.endsWith("status=pending")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(rows) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
}

function LocationProbe(): React.JSX.Element {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

const row = {
  token: "p1",
  tool_name: "create_list",
  payload: { name: "Trap" },
  created_at: 0,
  expires_at: 0,
};

describe("ApprovalsSection", () => {
  beforeEach(() => {
    mockPending([]);
  });

  it("hides badge when pending = 0", async () => {
    mockPending([]);
    render(
      <MemoryRouter>
        <ApprovalsSection />
      </MemoryRouter>,
    );
    await screen.findByText(/Agent Actions/i);
    expect(screen.queryByText(/\(\d+\)/)).toBeNull();
  });

  it("shows yellow badge when pending > 0", async () => {
    mockPending([row, { ...row, token: "p2" }]);
    render(
      <MemoryRouter>
        <ApprovalsSection />
      </MemoryRouter>,
    );
    const badge = await screen.findByText("2");
    expect(badge.className).toMatch(/bg-warning/);
    expect(badge.className).toMatch(/rounded-full/);
  });

  it("navigates to /approvals on click", async () => {
    mockPending([]);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ApprovalsSection />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /agent actions/i }));
    expect(screen.getByTestId("loc").textContent).toBe("/approvals");
  });
});
