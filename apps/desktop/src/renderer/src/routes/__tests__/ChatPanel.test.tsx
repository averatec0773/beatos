import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/ai", () => ({ ai: { status: vi.fn() } }));
vi.mock("@/api/chat", () => ({ chatApi: { send: vi.fn(), confirm: vi.fn() } }));

import { ChatPanel } from "@/routes/ChatPanel";
import { ai } from "@/api/ai";
import { chatApi } from "@/api/chat";
import { useChatStore } from "@/stores/chat";

describe("ChatPanel", () => {
  beforeEach(() => {
    useChatStore.setState({
      conversationId: null, messages: [], input: "", sending: false,
      pendingConfirm: null, error: null,
    });
    vi.mocked(ai.status).mockReset();
    vi.mocked(chatApi.send).mockReset();
  });

  it("shows the not-configured prompt when AI is off", async () => {
    vi.mocked(ai.status).mockResolvedValue({
      provider: null, has_key: false, enabled: false, model: "", supported: [], supported_models: [],
    });
    render(<ChatPanel />);
    expect(await screen.findByText(/AI is not set up/)).toBeInTheDocument();
  });

  it("sends a message and renders the reply when AI is on", async () => {
    vi.mocked(ai.status).mockResolvedValue({
      provider: "anthropic", has_key: true, enabled: true, model: "claude-haiku-4-5",
      supported: ["anthropic"], supported_models: ["claude-haiku-4-5"],
    });
    vi.mocked(chatApi.send).mockResolvedValue({
      conversation_id: 1, reply: "Found 3 beats.", tool_calls: [{ name: "search_tracks", input: {} }],
      messages: [], pending_confirm: null,
    });
    render(<ChatPanel />);
    const input = await screen.findByPlaceholderText(/Message your catalog assistant/);
    await userEvent.type(input, "find my beats");
    await userEvent.click(screen.getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(screen.getByText("Found 3 beats.")).toBeInTheDocument());
    expect(screen.getByText("find my beats")).toBeInTheDocument();
  });
});
