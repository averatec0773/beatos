import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/chat", () => ({
  chatApi: { send: vi.fn(), confirm: vi.fn() },
}));

import { useChatStore } from "../chat";
import { chatApi } from "@/api/chat";

function reset() {
  useChatStore.setState({
    conversationId: null, messages: [], input: "", sending: false,
    pendingConfirm: null, error: null,
  });
}

describe("useChatStore", () => {
  beforeEach(() => {
    reset();
    vi.mocked(chatApi.send).mockReset();
    vi.mocked(chatApi.confirm).mockReset();
  });

  it("send pushes the user message, the assistant reply, and the conversation id", async () => {
    vi.mocked(chatApi.send).mockResolvedValue({
      conversation_id: 7, reply: "Hi there.", tool_calls: [], messages: [], pending_confirm: null,
    });
    useChatStore.setState({ input: "hello" });
    await useChatStore.getState().send();
    const s = useChatStore.getState();
    expect(s.messages[0]).toEqual({ role: "user", text: "hello" });
    expect(s.messages[1].role).toBe("assistant");
    expect(s.messages[1].text).toBe("Hi there.");
    expect(s.conversationId).toBe(7);
    expect(s.input).toBe("");
    expect(s.sending).toBe(false);
  });

  it("send surfaces a pending destructive confirm", async () => {
    vi.mocked(chatApi.send).mockResolvedValue({
      conversation_id: 7, reply: "I'll trash it.", tool_calls: [],
      messages: [], pending_confirm: { tool_uses: [{ id: "d1", name: "trash_tracks", input: { ids: [1] } }], summary: "Move 1 track to Trash" },
    });
    useChatStore.setState({ input: "trash it" });
    await useChatStore.getState().send();
    expect(useChatStore.getState().pendingConfirm?.summary).toBe("Move 1 track to Trash");
  });

  it("confirm(true) calls the api with the conversation id and clears the pending confirm", async () => {
    useChatStore.setState({
      conversationId: 7,
      pendingConfirm: { tool_uses: [{ id: "d1", name: "trash_tracks", input: { ids: [1] } }], summary: "x" },
    });
    vi.mocked(chatApi.confirm).mockResolvedValue({
      conversation_id: 7, reply: "Trashed.", tool_calls: [], messages: [], pending_confirm: null,
    });
    await useChatStore.getState().confirm(true);
    expect(chatApi.confirm).toHaveBeenCalledWith({ conversation_id: 7, approve: true });
    const s = useChatStore.getState();
    expect(s.pendingConfirm).toBeNull();
    expect(s.messages.at(-1)?.text).toBe("Trashed.");
  });

  it("send records an error and clears sending on failure", async () => {
    vi.mocked(chatApi.send).mockRejectedValue(new Error("boom"));
    useChatStore.setState({ input: "hi" });
    await useChatStore.getState().send();
    const s = useChatStore.getState();
    expect(s.error).toContain("boom");
    expect(s.sending).toBe(false);
  });
});
