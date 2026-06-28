import { apiDelete, apiGet, apiPost } from "./client";

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  skipped?: boolean;
}

export interface PendingToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface PendingConfirm {
  tool_uses: PendingToolUse[];
  summary: string;
}

export interface ChatTurnResponse {
  conversation_id: number;
  reply: string;
  tool_calls: ToolCall[];
  messages: { role: string; content: unknown }[];
  pending_confirm: PendingConfirm | null;
}

export interface ConversationSummary {
  id: number;
  title: string;
  created_at: number;
  updated_at: number;
}

/** One stored message in Anthropic shape: content is a string or a block list. */
export interface StoredMessage {
  role: string;
  content: unknown;
}

export interface ConversationDetail extends ConversationSummary {
  messages: StoredMessage[];
}

export const chatApi = {
  send: (body: { message: string; conversation_id?: number | null }) =>
    apiPost<ChatTurnResponse>("/api/ai/chat", {
      message: body.message,
      conversation_id: body.conversation_id ?? undefined,
    }),
  confirm: (body: { conversation_id: number; approve: boolean }) =>
    apiPost<ChatTurnResponse>("/api/ai/chat/confirm", body),
  listConversations: () =>
    apiGet<{ conversations: ConversationSummary[] }>("/api/ai/chat/conversations"),
  getConversation: (id: number) =>
    apiGet<ConversationDetail>(`/api/ai/chat/conversations/${id}`),
  deleteConversation: (id: number) => apiDelete(`/api/ai/chat/conversations/${id}`),
};
