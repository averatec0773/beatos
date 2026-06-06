import { useState } from "react";
import { useTranslation } from "react-i18next";

import { platform } from "@/platform";

type TestResult = { ok: true; toolsCount: number; version: string } | { ok: false; error: string };

interface Props {
  dbPath: string;
  repoRoot: string;
}

const TOOL_NAMES = ["ping", "list_tracks", "get_track", "list_lists", "list_distinct_values"];

function buildConfigJson(repoRoot: string, dbPath: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        beatos: {
          command: "uv",
          args: ["run", "--directory", repoRoot, "beatos-mcp"],
          env: { BEATOS_DB_PATH: dbPath },
        },
      },
    },
    null,
    2,
  );
}

export function AIIntegrationSection({ dbPath, repoRoot }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [testState, setTestState] = useState<
    "idle" | "testing" | { kind: "result"; result: TestResult }
  >("idle");

  const configJson = buildConfigJson(repoRoot, dbPath);

  const copyJson = async (): Promise<void> => {
    await navigator.clipboard.writeText(configJson);
  };

  const copyPath = async (): Promise<void> => {
    await navigator.clipboard.writeText(dbPath);
  };

  const runTest = async (): Promise<void> => {
    setTestState("testing");
    const result = await platform.testMcpConnection();
    setTestState({ kind: "result", result });
  };

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

          <div className="flex items-center justify-between gap-3">
            <span>{t("ai.database")}</span>
            <div className="flex min-w-0 items-center gap-2">
              <code className="truncate text-xs text-text-secondary">{dbPath}</code>
              <button
                type="button"
                className="shrink-0 rounded border border-border-subtle px-2 py-0.5 text-xs hover:bg-bg-row-hover"
                onClick={copyPath}
              >
                {t("ai.copyPath")}
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-text-tertiary">
              {t("ai.claudeConfig")}
            </div>
            <pre className="max-h-64 overflow-auto rounded bg-bg-elevated p-3 text-xs">
              {configJson}
            </pre>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="rounded border border-border-subtle px-2 py-0.5 text-xs hover:bg-bg-row-hover"
                onClick={copyJson}
              >
                {t("ai.copyJson")}
              </button>
            </div>
          </div>

          <div className="text-xs text-text-tertiary">
            {t("ai.toolsList", { count: TOOL_NAMES.length, list: TOOL_NAMES.join(" · ") })}
          </div>
        </div>
      )}
    </section>
  );
}
