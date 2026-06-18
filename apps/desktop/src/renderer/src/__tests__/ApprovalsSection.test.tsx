import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ApprovalsSection } from "@/components/Sidebar/ApprovalsSection";

function LocationProbe(): React.JSX.Element {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

describe("ApprovalsSection", () => {
  it("renders the nav button without a badge", () => {
    render(
      <MemoryRouter>
        <ApprovalsSection />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /agent actions/i })).toBeInTheDocument();
    expect(screen.queryByText(/\(\d+\)/)).toBeNull();
  });

  it("navigates to /approvals on click", async () => {
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
