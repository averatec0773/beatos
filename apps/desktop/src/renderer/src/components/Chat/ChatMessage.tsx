import React from "react";
import { Sparkles, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ToolCall } from "@/api/chat";
import type { ChatMessage as ChatMessageT } from "@/stores/chat";
import { MarkdownLite } from "@/lib/markdown-lite";

function ToolChip({ call }: { call: ToolCall }): React.JSX.Element {
  const { t } = useTranslation();
  const failed = Boolean(call.error);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        failed
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-white/10 bg-white/[0.05] text-text-tertiary"
      }`}
    >
      <Wrench className="h-3 w-3" />
      {failed ? t("chat.toolFailed", { tool: call.name }) : t("chat.ranTool", { tool: call.name })}
    </span>
  );
}

/** The assistant's monogram avatar — a small backlit-glass disc. */
export function AssistantAvatar(): React.JSX.Element {
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <Sparkles className="h-3.5 w-3.5" />
    </div>
  );
}

export function ChatMessageRow({ message }: { message: ChatMessageT }): React.JSX.Element {
  const calls = message.toolCalls ?? [];
  if (message.role === "user") {
    return (
      <div className="chat-in flex justify-end">
        <div className="max-w-[82%] rounded-[20px] rounded-br-[7px] border border-white/10 bg-white/[0.08] px-4 py-2.5 text-[14px] leading-relaxed text-text-primary shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
          <p className="whitespace-pre-wrap">{message.text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="chat-in flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-0.5 text-[14px] text-text-primary">
        {message.text ? (
          <MarkdownLite text={message.text} />
        ) : (
          calls.length === 0 && <span className="text-text-tertiary">—</span>
        )}
        {calls.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {calls.map((c, j) => (
              <ToolChip key={j} call={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Three-dot pulse shown while a turn is in flight. */
export function TypingIndicator(): React.JSX.Element {
  return (
    <div className="chat-in flex gap-3">
      <AssistantAvatar />
      <div className="flex items-center gap-1 pt-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="chat-dot h-1.5 w-1.5 rounded-full bg-text-tertiary"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}
