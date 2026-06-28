import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ActivityList } from "@/components/Approvals/ActivityList";
import type { AgentAction } from "@/hooks/use-agent-actions";

const actions: AgentAction[] = [
  {
    id: 1,
    ts: 1_700_000_000,
    tool_name: "trash_tracks",
    summary: { headline: "Trash 2 tracks" },
    client_name: "claude-ai",
    status: "applied",
    result: { trashed_count: 2 },
  },
  {
    id: 2,
    ts: 1_700_000_100,
    tool_name: "update_tracks",
    summary: { headline: "Update BPM" },
    client_name: "chat",
    status: "applied",
    result: {},
  },
];

describe("ActivityList", () => {
  it("calls onDelete with the row id when a row's × is clicked", async () => {
    const onDelete = vi.fn();
    render(<ActivityList actions={actions} onDelete={onDelete} />);
    const deletes = screen.getAllByRole("button", { name: /Delete/ });
    expect(deletes).toHaveLength(2);
    await userEvent.click(deletes[0]);
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("renders no delete buttons without onDelete", () => {
    render(<ActivityList actions={actions} />);
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });
});
