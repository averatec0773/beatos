import React, { useEffect, useRef, useState } from "react";
import { Send, Loader2, Wrench, AlertTriangle, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ai } from "@/api/ai";
import { useChatStore } from "@/stores/chat";
import type { ToolCall } from "@/api/chat";

function ToolChip({ call }: { call: ToolCall }): React.JSX.Element {
  const { t } = useTranslation();
  const failed = Boolean(call.error);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
        failed
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-border-subtle bg-bg-elevated text-text-secondary"
      }`}
    >
      <Wrench className="h-3 w-3" />
      {failed ? t("chat.toolFailed", { tool: call.name }) : t("chat.ranTool", { tool: call.name })}
    </span>
  );
}

export function ChatPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  const messages = useChatStore((s) => s.messages);
  const input = useChatStore((s) => s.input);
  const sending = useChatStore((s) => s.sending);
  const pendingConfirm = useChatStore((s) => s.pendingConfirm);
  const error = useChatStore((s) => s.error);
  const setInput = useChatStore((s) => s.setInput);
  const send = useChatStore((s) => s.send);
  const confirm = useChatStore((s) => s.confirm);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    ai.status()
      .then((s) => !cancelled && setAiEnabled(s.enabled))
      .catch(() => !cancelled && setAiEnabled(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, pendingConfirm]);

  if (aiEnabled === false) {
    return (
      <div className="beatos-card flex h-full flex-col items-center justify-center rounded-xl p-8 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-bg-elevated">
          <Sparkles className="h-6 w-6 text-text-tertiary" />
        </div>
        <h1 className="mb-1.5 text-lg font-semibold text-text-primary">
          {t("chat.notConfiguredTitle")}
        </h1>
        <p className="max-w-sm text-sm text-text-secondary">{t("chat.notConfiguredBody")}</p>
      </div>
    );
  }

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    void send();
  };

  return (
    <div className="beatos-card flex h-full flex-col rounded-xl p-5">
      <h1 className="mb-3 text-lg font-semibold text-text-primary">{t("chat.title")}</h1>

      <div className="beatos-scroll flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="mx-auto max-w-md pt-10 text-center text-sm text-text-tertiary">
            {t("chat.emptyHint")}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user"
                  ? "bg-accent/15 text-text-primary"
                  : "bg-bg-elevated text-text-primary"
              }`}
            >
              {m.text && <p className="whitespace-pre-wrap leading-snug">{m.text}</p>}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.toolCalls.map((c, j) => (
                    <ToolChip key={j} call={c} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {pendingConfirm && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="font-medium">{t("chat.confirmTitle")}</span>
            </div>
            <p className="mb-2.5 text-sm text-text-primary">{pendingConfirm.summary}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => void confirm(true)}
                className="rounded-md bg-warning px-3 py-1 text-xs font-medium text-bg-base hover:opacity-90 disabled:opacity-50"
              >
                {t("chat.apply")}
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void confirm(false)}
                className="rounded-md border border-border-subtle px-3 py-1 text-xs text-text-secondary hover:bg-bg-row-hover disabled:opacity-50"
              >
                {t("chat.decline")}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {t("chat.errorPrefix")}: {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="mt-3 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chat.placeholder")}
          disabled={sending}
          className="h-10 flex-1 rounded-md border border-border-subtle bg-bg-elevated px-3 text-sm text-text-primary focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-bg-base hover:opacity-90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? t("chat.thinking") : t("chat.send")}
        </button>
      </form>
    </div>
  );
}
