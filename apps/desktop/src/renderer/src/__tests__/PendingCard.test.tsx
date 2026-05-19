import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { PendingCard } from "@/components/Approvals/PendingCard";
import type { PendingToken } from "@/hooks/use-pending-tokens";

function makeToken(overrides: Partial<PendingToken> = {}): PendingToken {
  const now = Math.floor(Date.now() / 1000);
  return {
    token: "tok-1",
    tool_name: "update_tracks",
    payload: {
      ids: [1, 2, 3],
      patch: { producer: { add: ["X"] } },
      preview: {
        headline: "Add producer X to 3 tracks",
        sample: ["#1 Beat A", "#2 Beat B", "#3 Beat C"],
        warnings: [],
      },
    },
    created_at: now - 30,
    expires_at: now + 600,
    ...overrides,
  };
}

describe("PendingCard", () => {
  it("renders the preview headline + sample", () => {
    render(
      <PendingCard token={makeToken()} onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText("Add producer X to 3 tracks")).toBeInTheDocument();
    expect(screen.getByText(/Beat A/)).toBeInTheDocument();
    expect(screen.getByText(/Beat C/)).toBeInTheDocument();
  });

  it("shows 'Show all N' when sample is truncated", () => {
    const tok = makeToken({
      payload: {
        ids: Array.from({ length: 12 }, (_, i) => i + 1),
        patch: {},
        preview: {
          headline: "Trash 12 tracks",
          sample: ["#1 A", "#2 B", "#3 C", "#4 D", "#5 E"],
          warnings: [],
        },
      },
    });
    render(<PendingCard token={tok} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText(/Show all 12/)).toBeInTheDocument();
  });

  it("renders warnings", () => {
    const tok = makeToken({
      payload: {
        ids: [1, 2, 3],
        preview: {
          headline: "Update 3 tracks",
          sample: ["#1 A", "#2 B", "#3 C"],
          warnings: ["1 of 3 ids not found"],
        },
      },
    });
    render(<PendingCard token={tok} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText("1 of 3 ids not found")).toBeInTheDocument();
  });

  it("high-risk variant: approve disabled until checkbox checked", () => {
    const onApprove = vi.fn();
    const tok = makeToken({
      tool_name: "purge_tracks",
      payload: {
        ids: [1, 2, 3],
        preview: {
          headline: "PERMANENTLY DELETE 3 tracks",
          sample: ["#1 A", "#2 B", "#3 C"],
          warnings: [],
          risk: "destructive",
        },
      },
    });
    render(<PendingCard token={tok} onApprove={onApprove} onReject={vi.fn()} />);
    const approveBtn = screen.getByRole("button", { name: /Approve/ }) as HTMLButtonElement;
    expect(approveBtn).toBeDisabled();
    const checkbox = screen.getByRole("checkbox", {
      name: /I understand this is permanent/i,
    });
    fireEvent.click(checkbox);
    expect(approveBtn).not.toBeDisabled();
    fireEvent.click(approveBtn);
    expect(onApprove).toHaveBeenCalledWith("tok-1");
  });

  it("legacy payload without preview falls back to JSON", () => {
    const tok = makeToken({
      tool_name: "create_list",
      payload: { name: "Trap 2026" },
    });
    render(<PendingCard token={tok} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText(/create_list/)).toBeInTheDocument();
    expect(screen.getByText(/Trap 2026/)).toBeInTheDocument();
  });

  it("expand toggles the full ids list", () => {
    const tok = makeToken({
      payload: {
        ids: Array.from({ length: 8 }, (_, i) => i + 100),
        preview: {
          headline: "Trash 8 tracks",
          sample: ["#100 A", "#101 B", "#102 C", "#103 D", "#104 E"],
          warnings: [],
        },
      },
    });
    render(<PendingCard token={tok} onApprove={vi.fn()} onReject={vi.fn()} />);
    fireEvent.click(screen.getByText(/Show all 8/));
    // Expanded list shows ids 100..107
    expect(screen.getByText(/107/)).toBeInTheDocument();
  });
});
