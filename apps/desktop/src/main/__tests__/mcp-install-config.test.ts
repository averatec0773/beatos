import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildClaudeCodeArgs,
  installClaudeDesktopConfig,
  installCodexConfig,
} from "../mcp/install-config";

describe("MCP client config installer", () => {
  it("merges BeatOS into Claude Desktop config without dropping existing servers", () => {
    const dir = mkdtempSync(join(tmpdir(), "beatos-claude-config-"));
    const configPath = join(dir, "claude_desktop_config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ mcpServers: { existing: { command: "npx", args: ["x"] } } }, null, 2),
    );

    const result = installClaudeDesktopConfig({ configPath, repoRoot: "/repo" });
    const written = JSON.parse(readFileSync(configPath, "utf8"));

    expect(result.ok).toBe(true);
    expect(written.mcpServers.existing.command).toBe("npx");
    expect(written.mcpServers.beatos).toEqual({
      command: "uv",
      args: ["run", "--directory", "/repo", "beatos-mcp"],
    });
    expect(JSON.stringify(written)).not.toContain("BEATOS_DB_PATH");
  });

  it("replaces only the BeatOS Codex MCP table", () => {
    const dir = mkdtempSync(join(tmpdir(), "beatos-codex-config-"));
    const configPath = join(dir, "config.toml");
    writeFileSync(
      configPath,
      [
        'model = "gpt-5.5"',
        "",
        "[mcp_servers.other]",
        'command = "npx"',
        "",
        "[mcp_servers.beatos]",
        'command = "old"',
        'args = ["old"]',
        "",
        "[mcp_servers.beatos.env]",
        'BEATOS_DB_PATH = "/old.db"',
      ].join("\n"),
    );

    const result = installCodexConfig({ configPath, repoRoot: "/repo" });
    const written = readFileSync(configPath, "utf8");

    expect(result.ok).toBe(true);
    expect(written).toContain('model = "gpt-5.5"');
    expect(written).toContain("[mcp_servers.other]");
    expect(written).toContain("[mcp_servers.beatos]");
    expect(written).toContain('args = ["run", "--directory", "/repo", "beatos-mcp"]');
    expect(written).not.toContain('command = "old"');
    expect(written).not.toContain("BEATOS_DB_PATH");
  });

  it("builds a Claude Code user-scope stdio install command", () => {
    expect(buildClaudeCodeArgs("/repo")).toEqual([
      "mcp",
      "add",
      "--transport",
      "stdio",
      "--scope",
      "user",
      "beatos",
      "--",
      "uv",
      "run",
      "--directory",
      "/repo",
      "beatos-mcp",
    ]);
  });
});
