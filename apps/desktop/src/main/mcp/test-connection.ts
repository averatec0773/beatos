import { spawn } from "node:child_process";
import { app } from "electron";

export type McpTestResult =
  | { ok: true; toolsCount: number; version: string }
  | { ok: false; error: string };

const TIMEOUT_MS = 5000;

/** Spawn `uv run beatos-mcp`, send initialize + tools/list, parse response.
 *  All errors are returned (never thrown) so the renderer can render a
 *  friendly message. */
export async function testMcpConnection(opts: {
  repoRoot: string;
  dbPath: string;
}): Promise<McpTestResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: McpTestResult): void => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve(r);
    };

    const child = spawn(
      "uv",
      ["run", "--directory", opts.repoRoot, "beatos-mcp"],
      {
        env: { ...process.env, BEATOS_DB_PATH: opts.dbPath },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const timer = setTimeout(
      () => finish({ ok: false, error: `Timed out after ${TIMEOUT_MS}ms` }),
      TIMEOUT_MS,
    );

    let stdoutBuf = "";
    let stderrBuf = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString("utf8");
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 2 && msg.result?.tools) {
            clearTimeout(timer);
            finish({
              ok: true,
              toolsCount: msg.result.tools.length,
              version: app.getVersion(),
            });
            return;
          }
          if (msg.id === 2 && msg.error) {
            clearTimeout(timer);
            finish({
              ok: false,
              error: `MCP error: ${msg.error.message ?? "unknown"}`,
            });
            return;
          }
        } catch {
          // Ignore malformed line — keep buffering.
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      finish({ ok: false, error: `Spawn failed: ${err.message}` });
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled) {
        finish({
          ok: false,
          error: `Exited with code ${code}. stderr tail: ${stderrBuf.slice(-300)}`,
        });
      }
    });

    const send = (obj: unknown): void => {
      child.stdin.write(JSON.stringify(obj) + "\n");
    };
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "beatos-settings-test", version: "0" },
      },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  });
}
