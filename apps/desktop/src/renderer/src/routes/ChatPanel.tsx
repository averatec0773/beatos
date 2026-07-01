import React, { useEffect, useRef, useState } from "react";
import { Send, Loader2, AlertTriangle, Sparkles, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ai } from "@/api/ai";
import { isDesktop } from "@/platform";
import { useChatStore } from "@/stores/chat";
import { ChatMessageRow, TypingIndicator } from "@/components/Chat/ChatMessage";

const COLUMN = "mx-auto w-full max-w-[760px]";

function EmptyState({ onPick }: { onPick: (s: string) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const suggestions = [t("chat.suggest1"), t("chat.suggest2"), t("chat.suggest3")];
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="mb-1.5 text-lg font-semibold text-text-primary">{t("chat.emptyTitle")}</h2>
      <p className="mb-6 max-w-md text-sm leading-relaxed text-text-tertiary">
        {t("chat.emptyHint")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[13px] text-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-text-primary"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
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
  const reset = useChatStore((s) => s.reset);
  const hydrate = useChatStore((s) => s.hydrate);

  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    ai.status()
      .then((s) => {
        if (cancelled) return;
        setAiEnabled(s.enabled);
        // Resume the last conversation once AI is confirmed on (no-op otherwise).
        if (s.enabled) void hydrate();
      })
      .catch(() => !cancelled && setAiEnabled(false));
    return () => {
      cancelled = true;
    };
  }, [hydrate]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, pendingConfirm, sending]);

  // Auto-grow the composer up to ~6 lines, then scroll internally.
  const autosize = (): void => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  };
  useEffect(autosize, [input]);

  if (aiEnabled === false) {
    return (
      <section className="beatos-card flex h-full flex-1 flex-col items-center justify-center rounded-xl p-8 text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-bg-elevated">
          <Sparkles className="h-6 w-6 text-text-tertiary" />
        </div>
        <h1 className="mb-1.5 text-lg font-semibold text-text-primary">
          {t("chat.notConfiguredTitle")}
        </h1>
        <p className="max-w-sm text-sm text-text-secondary">
          {isDesktop ? t("chat.notConfiguredBody") : t("chat.notConfiguredBodyWeb")}
        </p>
      </section>
    );
  }

  const submit = (): void => {
    void send();
    requestAnimationFrame(autosize);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onPick = (s: string): void => {
    setInput(s);
    void send();
  };

  const hasMessages = messages.length > 0;

  return (
    <section className="beatos-card flex h-full flex-1 flex-col overflow-hidden rounded-xl">
      {/* Header */}
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-6 py-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-text-primary">{t("chat.title")}</h1>
          <p className="mt-0.5 truncate text-xs text-text-tertiary">{t("chat.subtitle")}</p>
        </div>
        {hasMessages && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] text-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("chat.newChat")}
          </button>
        )}
      </header>

      {/* Conversation */}
      <div className="beatos-scroll flex-1 overflow-y-auto">
        {!hasMessages && !pendingConfirm ? (
          <EmptyState onPick={onPick} />
        ) : (
          <div className={`${COLUMN} space-y-5 px-6 py-6`}>
            {messages.map((m, i) => (
              <ChatMessageRow key={i} message={m} />
            ))}

            {sending && <TypingIndicator />}

            {pendingConfirm && (
              <div className="chat-in rounded-2xl border border-warning/40 bg-warning/[0.08] px-4 py-3.5">
                <div className="mb-2 flex items-center gap-2 text-sm text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{t("chat.confirmTitle")}</span>
                </div>
                <p className="mb-3 text-sm leading-relaxed text-text-primary">
                  {pendingConfirm.summary}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void confirm(true)}
                    className="rounded-lg bg-warning px-3.5 py-1.5 text-xs font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {t("chat.apply")}
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void confirm(false)}
                    className="rounded-lg border border-border-subtle px-3.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-row-hover disabled:opacity-50"
                  >
                    {t("chat.decline")}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="chat-in rounded-xl border border-danger/40 bg-danger/[0.08] px-3.5 py-2.5 text-xs text-danger">
                {t("chat.errorPrefix")}: {error}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border-subtle px-6 py-4">
        <div className={COLUMN}>
          <div className="flex items-end gap-2 rounded-[20px] border border-white/10 bg-white/[0.04] px-2 py-2 transition-colors focus-within:border-white/25">
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t("chat.placeholder")}
              aria-label={t("chat.placeholder")}
              className="beatos-scroll max-h-[168px] flex-1 resize-none bg-transparent px-2.5 py-1.5 text-[14px] leading-relaxed text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
            <button
              type="button"
              onClick={submit}
              disabled={sending || !input.trim()}
              aria-label={t("chat.send")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full btn-primary disabled:opacity-40"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
