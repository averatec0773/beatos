import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { AIIntegrationSection } from "../components/Settings/AIIntegrationSection";

const FAKE_BASE = "http://127.0.0.1:5555";

const mockBeatos = {
  testMcpConnection: vi.fn(),
  installMcpClientConfig: vi.fn(),
};

vi.mock("@/hooks/use-api-base", () => ({
  useApiBase: () => FAKE_BASE,
}));

vi.mock("@/stores/lists", () => ({
  useListStore: {
    getState: () => ({ refresh: vi.fn().mockResolvedValue(undefined) }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  (window as unknown as { beatos: unknown }).beatos = mockBeatos;
  (global.fetch as any) = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AIIntegrationSection", () => {
  it("renders collapsed by default and expands on click", async () => {
    const user = userEvent.setup();
    render(<AIIntegrationSection dbPath="/x/beatos.db" repoRoot="/r" />);
    expect(screen.queryByText(/Claude.*configuration/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: /AI Integration/i }));
    expect(screen.getByText(/Claude.*configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/Codex config\.toml/i)).toBeInTheDocument();
  });

  it("shows db path and copies Claude JSON snippet without legacy DB env", async () => {
    const user = userEvent.setup();
    render(<AIIntegrationSection dbPath="/x/beatos.db" repoRoot="/r" />);
    await user.click(screen.getByRole("button", { name: /AI Integration/i }));
    expect(screen.getByText("/x/beatos.db")).toBeInTheDocument();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await user.click(screen.getByRole("button", { name: /Copy JSON/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const written = writeText.mock.calls[0][0];
    expect(written).not.toContain("BEATOS_DB_PATH");
    expect(written).not.toContain("/x/beatos.db");
    expect(written).toContain("/r");
  });

  it("copies Codex config.toml snippet", async () => {
    const user = userEvent.setup();
    render(<AIIntegrationSection dbPath="/x/beatos.db" repoRoot="/r" />);
    await user.click(screen.getByRole("button", { name: /AI Integration/i }));
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await user.click(screen.getByRole("button", { name: /Copy TOML/i }));
    const written = writeText.mock.calls[0][0];
    expect(written).toContain("[mcp_servers.beatos]");
    expect(written).toContain('command = "uv"');
    expect(written).toContain('args = ["run", "--directory", "/r", "beatos-mcp"]');
    expect(written).not.toContain("BEATOS_DB_PATH");
  });

  it("Test connection shows success state", async () => {
    mockBeatos.testMcpConnection.mockResolvedValue({
      ok: true,
      toolsCount: 6,
      version: "0.0.20",
    });
    const user = userEvent.setup();
    render(<AIIntegrationSection dbPath="/x/beatos.db" repoRoot="/r" />);
    await user.click(screen.getByRole("button", { name: /AI Integration/i }));
    await user.click(screen.getByRole("button", { name: /Test connection/i }));
    await waitFor(() => expect(screen.getByText(/Connection OK · 6 tools/i)).toBeInTheDocument());
  });

  it("Test connection shows failure state", async () => {
    mockBeatos.testMcpConnection.mockResolvedValue({
      ok: false,
      error: "Spawn failed: command not found",
    });
    const user = userEvent.setup();
    render(<AIIntegrationSection dbPath="/x/beatos.db" repoRoot="/r" />);
    await user.click(screen.getByRole("button", { name: /AI Integration/i }));
    await user.click(screen.getByRole("button", { name: /Test connection/i }));
    await waitFor(() => expect(screen.getByText(/Spawn failed/i)).toBeInTheDocument());
  });

  it("installs client configs from one-click buttons", async () => {
    mockBeatos.installMcpClientConfig.mockResolvedValue({
      ok: true,
      target: "codex",
      message: "installed",
      path: "/x/config.toml",
    });
    const user = userEvent.setup();
    render(<AIIntegrationSection dbPath="/x/beatos.db" repoRoot="/r" />);
    await user.click(screen.getByRole("button", { name: /AI Integration/i }));
    await user.click(screen.getByRole("button", { name: /Install Codex/i }));
    await waitFor(() => expect(mockBeatos.installMcpClientConfig).toHaveBeenCalledWith("codex"));
    expect(screen.getByText(/installed/i)).toBeInTheDocument();
  });

  it("recovers when client setup rejects", async () => {
    mockBeatos.installMcpClientConfig.mockRejectedValue(new Error("IPC failed"));
    const user = userEvent.setup();
    render(<AIIntegrationSection dbPath="/x/beatos.db" repoRoot="/r" />);
    await user.click(screen.getByRole("button", { name: /AI Integration/i }));
    await user.click(screen.getByRole("button", { name: /Install Codex/i }));
    await waitFor(() => expect(screen.getByText(/IPC failed/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Install Codex/i })).toBeEnabled();
  });

  it("explains stale desktop process errors from missing IPC handlers", async () => {
    mockBeatos.installMcpClientConfig.mockRejectedValue(
      new Error(
        "Error invoking remote method 'mcp:install-client-config': Error: No handler registered for 'mcp:install-client-config'",
      ),
    );
    const user = userEvent.setup();
    render(<AIIntegrationSection dbPath="/x/beatos.db" repoRoot="/r" />);
    await user.click(screen.getByRole("button", { name: /AI Integration/i }));
    await user.click(screen.getByRole("button", { name: /Install Codex/i }));
    await waitFor(() => expect(screen.getByText(/Restart BeatOS/i)).toBeInTheDocument());
    expect(screen.queryByText(/No handler registered/i)).toBeNull();
  });

  it("times out a hung client setup instead of leaving the button installing forever", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockBeatos.installMcpClientConfig.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AIIntegrationSection dbPath="/x/beatos.db" repoRoot="/r" />);
    await user.click(screen.getByRole("button", { name: /AI Integration/i }));
    await user.click(screen.getByRole("button", { name: /Install Codex/i }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    await waitFor(() => expect(screen.getByText(/timed out/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Install Codex/i })).toBeEnabled();
  });

  it("no longer renders any Pending confirmations block (moved to /approvals)", async () => {
    const user = userEvent.setup();
    render(<AIIntegrationSection dbPath="/x/beatos.db" repoRoot="/r" />);
    await user.click(screen.getByRole("button", { name: /AI Integration/i }));
    expect(screen.queryByText(/Pending confirmations/i)).toBeNull();
  });
});
