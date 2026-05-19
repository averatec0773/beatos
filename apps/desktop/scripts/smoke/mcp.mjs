// v0.0.23 MCP transport assertions:
//   1. handshake.json includes pid (truthy number)
//   2. /mcp HTTP endpoint responds to an initialize round-trip
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Assert handshake.json written by the sidecar includes `pid`.
export async function assertHandshakePid(ctx) {
  const { app, failures } = ctx;
  try {
    const userDataPath = await app.evaluate(({ app }) => app.getPath("userData"));
    const hsPath = join(userDataPath, "runtime", "handshake.json");
    const hs = JSON.parse(readFileSync(hsPath, "utf-8"));
    if (typeof hs.port !== "number" || hs.port <= 0) {
      failures.push(`handshake.pid: port is not a positive number (got ${JSON.stringify(hs.port)})`);
      return;
    }
    if (typeof hs.pid !== "number" || hs.pid <= 0) {
      failures.push(`handshake.pid: pid is missing or not a positive number (got ${JSON.stringify(hs.pid)})`);
      return;
    }
    console.log(`smoke: handshake { port: ${hs.port}, pid: ${hs.pid} } PASS`);
  } catch (e) {
    failures.push(`handshake.pid assertion error: ${e.message}`);
  }
}

// Assert the /mcp endpoint responds to a JSON-RPC initialize request.
// Uses Electron's net.fetch (main-process side) to avoid CSP/renderer restrictions.
export async function assertMcpInitialize(ctx) {
  const { app, baseUrl, failures } = ctx;
  const port = parseInt(new URL(baseUrl).port, 10);
  try {
    const result = await app.evaluate(async ({ net }, port) => {
      const resp = await net.fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "smoke", version: "0" },
          },
        }),
      });
      const headers = Object.fromEntries(resp.headers.entries());
      const text = await resp.text();
      return {
        status: resp.status,
        hasSessionId: "mcp-session-id" in headers,
        hasResult: text.includes('"result":'),
      };
    }, port);

    if (result.status !== 200) {
      failures.push(`/mcp initialize: expected 200, got ${result.status}`);
      return;
    }
    if (!result.hasSessionId) {
      failures.push("/mcp initialize: response missing mcp-session-id header");
      return;
    }
    if (!result.hasResult) {
      failures.push('/mcp initialize: response body missing "result:"');
      return;
    }
    console.log("smoke: /mcp initialize round-trip PASS");
  } catch (e) {
    failures.push(`/mcp initialize assertion error: ${e.message}`);
  }
}
