import { create } from "zustand";

import { chatApi, type ChatTurnResponse, type PendingConfirm, type ToolCall } from "@/api/chat";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
}

interface ChatState {
  conversationId: number | null;
  messages: ChatMessage[];
  input: string;
  sending: boolean;
  pendingConfirm: PendingConfirm | null;
  error: string | null;
  setInput(v: string): void;
  send(): Promise<void>;
  confirm(approve: boolean): Promise<void>;
  reset(): void;
}

export const useChatStore = create<ChatState>((set, get) => {
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
    setInput: (v) => set({ input: v }),
    async send() {
      const text = get().input.trim();
      if (!text || get().sending) return;
      set({
        input: "",
        sending: true,
        error: null,
        messages: [...get().messages, { role: "user", text }],
      });
      try {
        applyTurn(await chatApi.send({ message: text, conversation_id: get().conversationId }));
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        set({ sending: false });
      }
    },
    async confirm(approve) {
      const cid = get().conversationId;
      if (cid == null || !get().pendingConfirm || get().sending) return;
      set({ sending: true, error: null, pendingConfirm: null });
      try {
        applyTurn(await chatApi.confirm({ conversation_id: cid, approve }));
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        set({ sending: false });
      }
    },
    reset: () =>
      set({ conversationId: null, messages: [], input: "", pendingConfirm: null, error: null }),
  };
});
