import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/api/app-settings", () => ({
  appSettings: {
    get: vi.fn().mockResolvedValue({ key: "agent_permission_mode", value: null }),
    set: vi.fn().mockResolvedValue({ key: "agent_permission_mode", value: "enabled" }),
  },
}));

import { appSettings } from "@/api/app-settings";
import { useAgentPermissionStore } from "@/stores/agent-permission";
import { AgentPermissionSection } from "@/components/Settings/AgentPermissionSection";

const setMock = appSettings.set as unknown as ReturnType<typeof vi.fn>;
const getMock = appSettings.get as unknown as ReturnType<typeof vi.fn>;

describe("AgentPermissionSection", () => {
  beforeEach(() => {
    useAgentPermissionStore.setState({ mode: "enabled" });
    setMock.mockClear();
  });

  it("shows Enabled selected by default and offers exactly two options (no dialog)", () => {
    render(<AgentPermissionSection />);
    expect(screen.getByRole("button", { name: /enabled/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /read-only/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("selecting read-only persists immediately without a dialog", async () => {
    const user = userEvent.setup();
    render(<AgentPermissionSection />);
    await user.click(screen.getByRole("button", { name: /read-only/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(setMock).toHaveBeenCalledWith("agent_permission_mode", "read_only");
    expect(useAgentPermissionStore.getState().mode).toBe("read_only");
  });

  it("selecting Enabled from read-only persists immediately", async () => {
    act(() => useAgentPermissionStore.setState({ mode: "read_only" }));
    const user = userEvent.setup();
    render(<AgentPermissionSection />);
    await user.click(screen.getByRole("button", { name: /enabled/i }));
    expect(setMock).toHaveBeenCalledWith("agent_permission_mode", "enabled");
    expect(useAgentPermissionStore.getState().mode).toBe("enabled");
  });
});

describe("agent-permission store legacy normalization", () => {
  beforeEach(() => {
    useAgentPermissionStore.setState({ mode: "enabled" });
  });

  it.each(["confirm", "auto_approve", "enabled"])(
    "hydrates legacy/current value %s to enabled",
    async (stored) => {
      getMock.mockResolvedValueOnce({ key: "agent_permission_mode", value: stored });
      await useAgentPermissionStore.getState().hydrate();
      expect(useAgentPermissionStore.getState().mode).toBe("enabled");
    },
  );

  it("hydrates read_only as read_only", async () => {
    getMock.mockResolvedValueOnce({ key: "agent_permission_mode", value: "read_only" });
    await useAgentPermissionStore.getState().hydrate();
    expect(useAgentPermissionStore.getState().mode).toBe("read_only");
  });
});
