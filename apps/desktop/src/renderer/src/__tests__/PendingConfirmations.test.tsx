import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PendingConfirmations } from "@/components/Settings/PendingConfirmations";

const baseToken = {
  token: "abc123",
  tool_name: "create_list",
  payload: { name: "Trap 2026" },
  created_at: Date.now() / 1000 - 12,
  expires_at: Date.now() / 1000 + 288,
};

describe("PendingConfirmations", () => {
  it("renders null when there are no tokens", () => {
    const { container } = render(
      <PendingConfirmations tokens={[]} onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a row per token with tool + payload summary", () => {
    render(
      <PendingConfirmations tokens={[baseToken]} onApprove={vi.fn()} onReject={vi.fn()} />,
    );
    expect(screen.getByText(/create_list/i)).toBeInTheDocument();
    expect(screen.getByText(/Trap 2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("invokes onApprove with the token when Approve clicked", async () => {
    const onApprove = vi.fn();
    render(
      <PendingConfirmations tokens={[baseToken]} onApprove={onApprove} onReject={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledWith("abc123");
  });

  it("invokes onReject with the token when Reject clicked", async () => {
    const onReject = vi.fn();
    render(
      <PendingConfirmations tokens={[baseToken]} onApprove={vi.fn()} onReject={onReject} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /reject/i }));
    expect(onReject).toHaveBeenCalledWith("abc123");
  });

  it("shows the pending count in the header", () => {
    render(
      <PendingConfirmations
        tokens={[baseToken, { ...baseToken, token: "xyz" }]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(screen.getByText(/Pending confirmations \(2\)/i)).toBeInTheDocument();
  });
});
