import { useState } from "react";
import { useTranslation } from "react-i18next";

import { platform } from "@/platform";

type TestResult = { ok: true; toolsCount: number; version: string } | { ok: false; error: string };
type InstallTarget = "claude_desktop" | "claude_code" | "codex";
type InstallResult =
  | {
      ok: true;
      target: InstallTarget;
      message: string;
      path?: string;
      backupPath?: string;
    }
  | { ok: false; target: InstallTarget; error: string; path?: string };

interface Props {
  dbPath: string;
  repoRoot: string;
}

const TOOL_NAMES = ["ping", "list_tracks", "get_track", "list_lists", "list_distinct_values"];
const INSTALL_TIMEOUT_MS = 15_000;
const copyButtonClass =
  "rounded border border-border-subtle px-2 py-0.5 text-xs text-text-secondary hover:bg-bg-row-hover hover:text-text-primary disabled:opacity-60";
const sectionLabelClass = "text-xs uppercase tracking-wide text-text-tertiary";
const codeBlockClass =
  "mt-1 max-h-64 overflow-auto rounded border border-border-subtle bg-bg-elevated p-3 font-mono text-xs text-text-primary";

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function buildConfigJson(repoRoot: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        beatos: {
          command: "uv",
          args: ["run", "--directory", repoRoot, "beatos-mcp"],
        },
      },
    },
    null,
    2,
  );
}

function buildCodexConfigToml(repoRoot: string): string {
  const args = ["run", "--directory", repoRoot, "beatos-mcp"].map(tomlString).join(", ");
  return [
    "[mcp_servers.beatos]",
    'command = "uv"',
    `args = [${args}]`,
    "startup_timeout_sec = 20",
    "tool_timeout_sec = 120",
    "enabled = true",
  ].join("\n");
}

function installErrorMessage(error: unknown, restartMessage: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("No handler registered for 'mcp:install-client-config'")
    ? restartMessage
    : message;
}

export function AIIntegrationSection({ dbPath, repoRoot }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [testState, setTestState] = useState<
    "idle" | "testing" | { kind: "result"; result: TestResult }
  >("idle");
  const [installState, setInstallState] = useState<
    | "idle"
    | { target: InstallTarget; status: "installing" }
    | { status: "result"; result: InstallResult }
  >("idle");

  const configJson = buildConfigJson(repoRoot);
  const codexConfigToml = buildCodexConfigToml(repoRoot);

  const copyJson = async (): Promise<void> => {
    await navigator.clipboard.writeText(configJson);
  };

  const copyToml = async (): Promise<void> => {
    await navigator.clipboard.writeText(codexConfigToml);
  };

  const copyPath = async (): Promise<void> => {
    await navigator.clipboard.writeText(dbPath);
  };

  const runTest = async (): Promise<void> => {
    setTestState("testing");
    const result = await platform.testMcpConnection();
    setTestState({ kind: "result", result });
  };

  const installClient = async (target: InstallTarget): Promise<void> => {
    setInstallState({ target, status: "installing" });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race<InstallResult>([
        platform.installMcpClientConfig(target),
        new Promise<InstallResult>((resolve) => {
          timeoutId = setTimeout(
            () =>
              resolve({
                ok: false,
                target,
                error: t("ai.installTimeout"),
              }),
            INSTALL_TIMEOUT_MS,
          );
        }),
      ]);
      setInstallState({ status: "result", result });
    } catch (error) {
      setInstallState({
        status: "result",
        result: {
          ok: false,
          target,
          error: installErrorMessage(error, t("ai.installRestartRequired")),
        },
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const isInstalling = typeof installState === "object" && installState.status === "installing";

  return (
    <section className="mt-10 pt-6 border-t border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm font-medium"
        aria-expanded={open}
        aria-label={t("ai.title")}
      >
        <h2 className="text-lg font-semibold">{t("ai.title")}</h2>
        <span className="text-text-tertiary">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-text-secondary">{t("ai.desc")}</p>

          <div className="flex items-center justify-between">
            <span>{t("ai.status")}</span>
            <div className="flex items-center gap-2">
              <span className="text-success">{t("ai.available")}</span>
              <button
                type="button"
                className="rounded border border-border-subtle px-2 py-0.5 text-xs hover:bg-bg-row-hover"
                onClick={runTest}
                disabled={testState === "testing"}
              >
                {testState === "testing" ? t("ai.testing") : t("ai.testConnection")}
              </button>
            </div>
          </div>

          {typeof testState === "object" && testState.kind === "result" && (
            <div className={testState.result.ok ? "text-success text-xs" : "text-danger text-xs"}>
              {testState.result.ok
                ? t("ai.connectionOk", { count: testState.result.toolsCount })
                : t("ai.connectionErr", { error: testState.result.error })}
            </div>
          )}

          <div>
            <div className={sectionLabelClass}>{t("ai.oneClick")}</div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["claude_desktop", t("ai.installClaudeDesktop")],
                  ["claude_code", t("ai.installClaudeCode")],
                  ["codex", t("ai.installCodex")],
                ] as const
              ).map(([target, label]) => (
                <button
                  key={target}
                  type="button"
                  className="rounded border border-border-subtle px-2 py-1 text-xs text-text-primary hover:bg-bg-row-hover disabled:opacity-60"
                  onClick={() => void installClient(target)}
                  disabled={isInstalling}
                >
                  {isInstalling && installState.target === target ? t("ai.installing") : label}
                </button>
              ))}
            </div>
            {typeof installState === "object" && installState.status === "result" && (
              <div
                className={
                  installState.result.ok ? "mt-2 text-success text-xs" : "mt-2 text-danger text-xs"
                }
              >
                {installState.result.ok
                  ? t("ai.installOk", { message: installState.result.message })
                  : t("ai.installErr", { error: installState.result.error })}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className={sectionLabelClass}>{t("ai.database")}</div>
              <button type="button" className={copyButtonClass} onClick={copyPath}>
                {t("ai.copyPath")}
              </button>
            </div>
            <code className="block truncate rounded border border-border-subtle bg-bg-elevated p-3 font-mono text-xs text-text-primary">
              {dbPath}
            </code>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className={sectionLabelClass}>{t("ai.claudeConfig")}</div>
              <button type="button" className={copyButtonClass} onClick={copyJson}>
                {t("ai.copyJson")}
              </button>
            </div>
            <pre className={codeBlockClass}>{configJson}</pre>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className={sectionLabelClass}>{t("ai.codexConfig")}</div>
              <button type="button" className={copyButtonClass} onClick={copyToml}>
                {t("ai.copyToml")}
              </button>
            </div>
            <pre className={codeBlockClass}>{codexConfigToml}</pre>
          </div>

          <div className="text-xs text-text-tertiary">
            {t("ai.toolsList", { count: TOOL_NAMES.length, list: TOOL_NAMES.join(" · ") })}
          </div>
        </div>
      )}
    </section>
  );
}
