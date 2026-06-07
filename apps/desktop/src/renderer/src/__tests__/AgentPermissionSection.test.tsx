import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/app-settings", () => ({
  appSettings: {
    get: vi.fn().mockResolvedValue({ key: "agent_permission_mode", value: null }),
    set: vi.fn().mockResolvedValue({ key: "agent_permission_mode", value: "confirm" }),
  },
}));

import { appSettings } from "@/api/app-settings";
import { useAgentPermissionStore } from "@/stores/agent-permission";
import { AgentPermissionSection } from "@/components/Settings/AgentPermissionSection";

const setMock = appSettings.set as unknown as ReturnType<typeof vi.fn>;

describe("AgentPermissionSection", () => {
  beforeEach(() => {
    useAgentPermissionStore.setState({ mode: "confirm" });
    setMock.mockClear();
  });

  it("shows the confirm option as selected by default", () => {
    render(<AgentPermissionSection />);
    expect(
      screen.getByRole("button", { name: /confirm every action/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /auto-approve all/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: /read-only/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("selecting read_only persists without a dialog", async () => {
    const user = userEvent.setup();
    render(<AgentPermissionSection />);
    await user.click(screen.getByRole("button", { name: /read-only/i }));
    expect(setMock).toHaveBeenCalledWith("agent_permission_mode", "read_only");
    expect(useAgentPermissionStore.getState().mode).toBe("read_only");
  });

  it("selecting auto_approve opens a confirm dialog", async () => {
    const user = userEvent.setup();
    render(<AgentPermissionSection />);
    await user.click(screen.getByRole("button", { name: /auto-approve all/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(setMock).not.toHaveBeenCalled();
  });

  it("cancelling the auto_approve dialog leaves mode unchanged", async () => {
    const user = userEvent.setup();
    render(<AgentPermissionSection />);
    await user.click(screen.getByRole("button", { name: /auto-approve all/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(setMock).not.toHaveBeenCalled();
    expect(useAgentPermissionStore.getState().mode).toBe("confirm");
  });

  it("confirming the auto_approve dialog persists the mode", async () => {
    const user = userEvent.setup();
    render(<AgentPermissionSection />);
    await user.click(screen.getByRole("button", { name: /auto-approve all/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(setMock).toHaveBeenCalledWith("agent_permission_mode", "auto_approve");
    expect(useAgentPermissionStore.getState().mode).toBe("auto_approve");
  });

  it("highlights the stored mode when pre-set to read_only", () => {
    act(() => useAgentPermissionStore.setState({ mode: "read_only" }));
    render(<AgentPermissionSection />);
    expect(
      screen.getByRole("button", { name: /read-only/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /confirm every action/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
