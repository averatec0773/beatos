import { create } from "zustand";

import {
  chatApi,
  type ChatTurnResponse,
  type PendingConfirm,
  type StoredMessage,
  type ToolCall,
} from "@/api/chat";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
}

/** Rebuild the user-visible thread from the stored Anthropic message array.
 * User turns carrying only tool_result blocks are internal plumbing and skipped;
 * assistant turns collapse their text + tool_use blocks into one bubble. */
function fromStored(messages: StoredMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const content = m.content;
    if (m.role === "user") {
      if (typeof content === "string" && content.trim()) {
        out.push({ role: "user", text: content });
      }
      continue;
    }
    if (m.role === "assistant") {
      if (typeof content === "string") {
        out.push({ role: "assistant", text: content });
        continue;
      }
      if (!Array.isArray(content)) continue;
      let text = "";
      const toolCalls: ToolCall[] = [];
      for (const b of content as Array<Record<string, unknown>>) {
        if (b.type === "text" && typeof b.text === "string") text += b.text;
        else if (b.type === "tool_use" && typeof b.name === "string") {
          toolCalls.push({
            name: b.name,
            input: (b.input as Record<string, unknown>) ?? {},
          });
        }
      }
      out.push({ role: "assistant", text, toolCalls: toolCalls.length ? toolCalls : undefined });
    }
  }
  return out;
}

interface ChatState {
  conversationId: number | null;
  messages: ChatMessage[];
  input: string;
  sending: boolean;
  pendingConfirm: PendingConfirm | null;
  error: string | null;
  hydrated: boolean;
  setInput(v: string): void;
  send(): Promise<void>;
  confirm(approve: boolean): Promise<void>;
  hydrate(): Promise<void>;
  reset(): void;
}

export const useChatStore = create<ChatState>((set, get) => {
  // Run epoch: bumped by every send/confirm and by reset(). A turn that resolves
  // after the user started a new thread (reset mid-flight) must be discarded —
  // otherwise its stale reply appends to the new thread, overwrites the fresh
  // conversationId, and can resurface an abandoned pendingConfirm.
  let runId = 0;

  const applyTurn = (res: ChatTurnResponse): void => {
    set({
      conversationId: res.conversation_id,
      messages: [
        ...get().messages,
        { role: "assistant", text: res.reply, toolCalls: res.tool_calls },
      ],
      pendingConfirm: res.pending_confirm,
    });
  };

  return {
    conversationId: null,
    messages: [],
    input: "",
    sending: false,
    pendingConfirm: null,
    error: null,
    hydrated: false,
    setInput: (v) => set({ input: v }),
    async send() {
      const text = get().input.trim();
      if (!text || get().sending) return;
      const run = ++runId;
      set({
        input: "",
        sending: true,
        error: null,
        messages: [...get().messages, { role: "user", text }],
      });
      try {
        const res = await chatApi.send({ message: text, conversation_id: get().conversationId });
        if (run === runId) applyTurn(res);
      } catch (e) {
        if (run === runId) set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (run === runId) set({ sending: false });
      }
    },
    async confirm(approve) {
      const cid = get().conversationId;
      if (cid == null || !get().pendingConfirm || get().sending) return;
      const run = ++runId;
      set({ sending: true, error: null, pendingConfirm: null });
      try {
        const res = await chatApi.confirm({ conversation_id: cid, approve });
        if (run === runId) applyTurn(res);
      } catch (e) {
        if (run === runId) set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        if (run === runId) set({ sending: false });
      }
    },
    async hydrate() {
      // Resume the most-recent conversation once per app launch. Guarded so it
      // never clobbers an in-progress thread (navigating back to /chat) or
      // double-runs under StrictMode's double-mount.
      if (get().hydrated || get().messages.length > 0) return;
      set({ hydrated: true });
      try {
        const { conversations } = await chatApi.listConversations();
        if (conversations.length === 0) return;
        const latest = conversations.reduce((a, b) => (b.updated_at > a.updated_at ? b : a));
        const conv = await chatApi.getConversation(latest.id);
        const messages = fromStored(conv.messages);
        if (messages.length > 0 && get().messages.length === 0) {
          set({ conversationId: conv.id, messages });
        }
      } catch {
        // Offline / no AI configured — stay on an empty thread.
      }
    },
    reset: () => {
      runId += 1; // invalidate any in-flight turn
      set({
        conversationId: null,
        messages: [],
        input: "",
        sending: false,
        pendingConfirm: null,
        error: null,
      });
    },
  };
});
