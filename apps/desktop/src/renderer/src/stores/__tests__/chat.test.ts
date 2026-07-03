import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/chat", () => ({
  chatApi: {
    send: vi.fn(),
    confirm: vi.fn(),
    listConversations: vi.fn(),
    getConversation: vi.fn(),
  },
}));

import { useChatStore } from "../chat";
import { chatApi } from "@/api/chat";

function reset() {
  useChatStore.setState({
    conversationId: null, messages: [], input: "", sending: false,
    pendingConfirm: null, error: null, hydrated: false,
  });
}

describe("useChatStore", () => {
  beforeEach(() => {
    reset();
    vi.mocked(chatApi.send).mockReset();
    vi.mocked(chatApi.confirm).mockReset();
    vi.mocked(chatApi.listConversations).mockReset();
    vi.mocked(chatApi.getConversation).mockReset();
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

  it("a turn resolving after reset() is discarded — no cross-thread merge", async () => {
    let resolveSend!: (v: unknown) => void;
    vi.mocked(chatApi.send).mockReturnValue(
      new Promise((r) => {
        resolveSend = r;
      }) as never,
    );
    useChatStore.setState({ input: "old thread" });
    const inflight = useChatStore.getState().send();
    useChatStore.getState().reset(); // "New chat" before the reply lands
    resolveSend({
      conversation_id: 9,
      reply: "stale",
      tool_calls: [],
      messages: [],
      pending_confirm: { tool_uses: [{ id: "d1", name: "trash_tracks", input: {} }], summary: "x" },
    });
    await inflight;
    const s = useChatStore.getState();
    expect(s.messages).toEqual([]);
    expect(s.conversationId).toBeNull();
    expect(s.pendingConfirm).toBeNull();
    expect(s.sending).toBe(false);
  });

  it("send records an error and clears sending on failure", async () => {
    vi.mocked(chatApi.send).mockRejectedValue(new Error("boom"));
    useChatStore.setState({ input: "hi" });
    await useChatStore.getState().send();
    const s = useChatStore.getState();
    expect(s.error).toContain("boom");
    expect(s.sending).toBe(false);
  });

  it("hydrate resumes the most-recent conversation and maps stored messages", async () => {
    vi.mocked(chatApi.listConversations).mockResolvedValue({
      conversations: [
        { id: 1, title: "old", created_at: 1, updated_at: 1 },
        { id: 2, title: "new", created_at: 2, updated_at: 5 },
      ],
    });
    vi.mocked(chatApi.getConversation).mockResolvedValue({
      id: 2,
      title: "new",
      created_at: 2,
      updated_at: 5,
      messages: [
        { role: "user", content: "find trap" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Found 2." },
            { type: "tool_use", id: "t1", name: "search_tracks", input: { q: "trap" } },
          ],
        },
        // internal tool_result turn — must be skipped in the UI thread
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "[]" }] },
      ],
    });
    await useChatStore.getState().hydrate();
    const s = useChatStore.getState();
    expect(chatApi.getConversation).toHaveBeenCalledWith(2); // newest by updated_at
    expect(s.conversationId).toBe(2);
    expect(s.messages).toEqual([
      { role: "user", text: "find trap" },
      { role: "assistant", text: "Found 2.", toolCalls: [{ name: "search_tracks", input: { q: "trap" } }] },
    ]);
    expect(s.hydrated).toBe(true);
  });

  it("hydrate is a no-op when a thread already has messages", async () => {
    useChatStore.setState({ messages: [{ role: "user", text: "hi" }] });
    await useChatStore.getState().hydrate();
    expect(chatApi.listConversations).not.toHaveBeenCalled();
  });
});
