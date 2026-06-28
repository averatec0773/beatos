import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SessionHealthRow } from "@/components/PublishCenter/SessionHealthRow";
import { LiveJobRow } from "@/components/PublishCenter/LiveJobRow";

describe("SessionHealthRow", () => {
  it("expired shows re-login prompt", () => {
    render(
      <SessionHealthRow platform="netease" state="expired" loggingIn={false} onLogin={vi.fn()} />,
    );
    expect(screen.getByText(/Expired/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Log in/ })).toBeEnabled();
  });
  it("valid shows logged-in badge", () => {
    render(
      <SessionHealthRow platform="netease" state="valid" loggingIn={false} onLogin={vi.fn()} />,
    );
    expect(screen.getByText(/Logged in/)).toBeInTheDocument();
  });
  it("loggingIn disables the button", () => {
    render(
      <SessionHealthRow platform="netease" state="expired" loggingIn={true} onLogin={vi.fn()} />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("LiveJobRow", () => {
  const base = {
    job_id: "j1",
    stage: "awaiting_sms",
    message: "enter SMS",
    updated_at: "2026-06-04T00:00:00Z",
    request: { track_id: 7, platform: "netease" },
  };
  it("awaiting_sms surfaces the waiting-for-you prompt", () => {
    render(<LiveJobRow job={base} title="My Beat" onRepublish={vi.fn()} />);
    expect(screen.getByText(/Waiting for you/)).toBeInTheDocument();
  });
  it("done with url shows a view link", () => {
    render(
      <LiveJobRow
        job={{ ...base, stage: "done", result: { ok: true, url: "https://x" } }}
        title="My Beat"
        onRepublish={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /View listing/ })).toHaveAttribute("href", "https://x");
  });
  it("calls onDelete with the job id when the × is clicked", async () => {
    const onDelete = vi.fn();
    render(<LiveJobRow job={base} title="My Beat" onRepublish={vi.fn()} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /Delete/ }));
    expect(onDelete).toHaveBeenCalledWith("j1");
  });
  it("renders no delete button without onDelete", () => {
    render(<LiveJobRow job={base} title="My Beat" onRepublish={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });
});
