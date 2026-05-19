import { useState } from "react";

type TestResult =
  | { ok: true; toolsCount: number; version: string }
  | { ok: false; error: string };

interface Props {
  dbPath: string;
  repoRoot: string;
}

const TOOL_NAMES = [
  "ping",
  "list_tracks",
  "get_track",
  "list_lists",
  "list_distinct_values",
];

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
    const result = await window.beatos.testMcpConnection();
    setTestState({ kind: "result", result });
  };

  return (
    <section className="mt-10 pt-6 border-t border-border-subtle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-sm font-medium"
        aria-expanded={open}
        aria-label="AI Integration"
      >
        <h2 className="text-lg font-semibold">AI Integration</h2>
        <span className="text-text-tertiary">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-text-secondary">
            Lets Claude Desktop and other AI clients read your BeatOS library
            over MCP. Read-only in v0.0.20.
          </p>

          <div className="flex items-center justify-between">
            <span>Status</span>
            <div className="flex items-center gap-2">
              <span className="text-success">● Available</span>
              <button
                type="button"
                className="rounded border border-border-subtle px-2 py-0.5 text-xs hover:bg-bg-row-hover"
                onClick={runTest}
                disabled={testState === "testing"}
              >
                {testState === "testing" ? "Testing…" : "Test connection"}
              </button>
            </div>
          </div>

          {typeof testState === "object" && testState.kind === "result" && (
            <div
              className={
                testState.result.ok
                  ? "text-success text-xs"
                  : "text-danger text-xs"
              }
            >
              {testState.result.ok
                ? `✓ Connection OK · ${testState.result.toolsCount} tools`
                : `✗ ${testState.result.error}`}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span>Database</span>
            <div className="flex min-w-0 items-center gap-2">
              <code className="truncate text-xs text-text-secondary">{dbPath}</code>
              <button
                type="button"
                className="shrink-0 rounded border border-border-subtle px-2 py-0.5 text-xs hover:bg-bg-row-hover"
                onClick={copyPath}
              >
                Copy path
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-text-tertiary">
              Claude Desktop configuration
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
                Copy JSON
              </button>
            </div>
          </div>

          <div className="text-xs text-text-tertiary">
            Tools ({TOOL_NAMES.length}): {TOOL_NAMES.join(" · ")}
          </div>
        </div>
      )}
    </section>
  );
}
