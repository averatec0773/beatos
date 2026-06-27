import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ai, type AiStatus } from "@/api/ai";
import { appSettings } from "@/api/app-settings";
import { useToastStore } from "@/stores/toast";

const PROVIDER_KEY = "ai_provider";
const API_KEY = "ai_api_key";
const MODEL_KEY = "ai_model";

// Model / provider display names are product proper nouns (exempt from i18n).
function modelLabel(id: string): string {
  if (id.includes("haiku")) return "Haiku";
  if (id.includes("sonnet")) return "Sonnet";
  if (id === "gpt-4o-mini") return "GPT-4o mini";
  if (id === "gpt-4o") return "GPT-4o";
  if (id.startsWith("deepseek")) return "DeepSeek Chat";
  return id;
}

function providerLabel(id: string): string {
  if (id === "anthropic") return "Anthropic";
  if (id === "openai") return "OpenAI";
  if (id === "deepseek") return "DeepSeek";
  return id;
}

export function AIAssistSection(): React.JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    try {
      setStatus(await ai.status());
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function selectProvider(provider: string): Promise<void> {
    setBusy(true);
    try {
      await appSettings.set(PROVIDER_KEY, provider);
      await refresh();
    } catch {
      useToastStore.getState().show("error", t("settings.aiAssist.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function selectModel(model: string): Promise<void> {
    setBusy(true);
    try {
      await appSettings.set(MODEL_KEY, model);
      await refresh();
    } catch {
      useToastStore.getState().show("error", t("settings.aiAssist.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveKey(): Promise<void> {
    const value = keyInput.trim();
    if (value === "") return;
    setBusy(true);
    try {
      await appSettings.set(API_KEY, value);
      setKeyInput("");
      await refresh();
      useToastStore.getState().show("success", t("settings.aiAssist.keySaved"));
    } catch {
      useToastStore.getState().show("error", t("settings.aiAssist.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeKey(): Promise<void> {
    setBusy(true);
    try {
      await appSettings.remove(API_KEY);
      await refresh();
    } catch {
      useToastStore.getState().show("error", t("settings.aiAssist.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const supported = status?.supported ?? [];
  const provider = status?.provider ?? null;
  const options: { value: string; label: string }[] = [
    { value: "", label: t("settings.aiAssist.off") },
    ...supported.map((p) => ({ value: p, label: providerLabel(p) })),
  ];

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">{t("settings.aiAssist.title")}</h2>
      <p className="text-xs text-text-tertiary mb-3">{t("settings.aiAssist.desc")}</p>

      <div className="text-xs text-text-secondary mb-1">{t("settings.aiAssist.provider")}</div>
      <div className="flex flex-col gap-2 mb-4">
        {options.map((opt) => {
          const active = (provider ?? "") === opt.value;
          return (
            <button
              key={opt.value || "off"}
              type="button"
              aria-pressed={active}
              disabled={busy}
              onClick={() => void selectProvider(opt.value)}
              className={`text-left rounded-md px-3 py-2 text-sm border transition-colors disabled:opacity-50 ${
                active
                  ? "border-accent/50 bg-accent/10 text-text-primary"
                  : "border-border-subtle text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {provider && (
        <>
          <div className="text-xs text-text-secondary mb-1">{t("settings.aiAssist.apiKey")}</div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={
                status?.has_key
                  ? t("settings.aiAssist.keyConfigured")
                  : t("settings.aiAssist.apiKeyPlaceholder")
              }
              className="flex-1 bg-bg-elevated border border-border-subtle rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={busy || keyInput.trim() === ""}
              onClick={() => void saveKey()}
              className="rounded-md px-3 py-2 text-sm btn-primary disabled:opacity-50"
            >
              {t("settings.aiAssist.saveKey")}
            </button>
            {status?.has_key && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeKey()}
                className="rounded-md border border-border-subtle px-3 py-2 text-sm text-text-tertiary hover:text-text-secondary disabled:opacity-50"
              >
                {t("settings.aiAssist.remove")}
              </button>
            )}
          </div>

          {status && status.supported_models.length > 1 && (
            <div className="mb-2">
              <div className="text-xs text-text-secondary mb-1">{t("settings.aiAssist.model")}</div>
              <div className="flex gap-2">
                {status.supported_models.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={status.model === m}
                    disabled={busy}
                    onClick={() => void selectModel(m)}
                    className={`rounded-md px-3 py-1.5 text-sm border transition-colors disabled:opacity-50 ${
                      status.model === m
                        ? "border-accent/50 bg-accent/10 text-text-primary"
                        : "border-border-subtle text-text-tertiary hover:text-text-secondary"
                    }`}
                  >
                    {modelLabel(m)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-text-tertiary mb-1">{t("settings.aiAssist.disclosure")}</p>
          <p className="text-xs">
            {status?.enabled ? (
              <span className="text-success">{t("settings.aiAssist.ready")}</span>
            ) : (
              <span className="text-text-tertiary">{t("settings.aiAssist.needsKey")}</span>
            )}
          </p>
        </>
      )}
    </section>
  );
}
