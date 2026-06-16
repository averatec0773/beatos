import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type McpClientTarget = "claude_desktop" | "claude_code" | "codex";

export type McpInstallResult =
  | { ok: true; target: McpClientTarget; message: string; path?: string; backupPath?: string }
  | { ok: false; target: McpClientTarget; error: string; path?: string };

interface InstallFileOptions {
  configPath: string;
  repoRoot: string;
}

interface InstallOptions {
  target: McpClientTarget;
  repoRoot: string;
  homeDir: string;
  platform: NodeJS.Platform;
  appData?: string;
}

function beatosServerConfig(repoRoot: string): { command: string; args: string[] } {
  return {
    command: "uv",
    args: ["run", "--directory", repoRoot, "beatos-mcp"],
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function codexBlock(repoRoot: string): string {
  const args = beatosServerConfig(repoRoot).args.map(tomlString).join(", ");
  return [
    "[mcp_servers.beatos]",
    'command = "uv"',
    `args = [${args}]`,
    "startup_timeout_sec = 20",
    "tool_timeout_sec = 120",
    "enabled = true",
  ].join("\n");
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

function backupIfExists(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const backupPath = `${path}.beatos.bak`;
  writeFileSync(backupPath, readFileSync(path));
  return backupPath;
}

export function installClaudeDesktopConfig({
  configPath,
  repoRoot,
}: InstallFileOptions): McpInstallResult {
  try {
    const raw = existsSync(configPath) ? readFileSync(configPath, "utf8") : "{}";
    const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
    const mcpServers =
      parsed.mcpServers &&
      typeof parsed.mcpServers === "object" &&
      !Array.isArray(parsed.mcpServers)
        ? (parsed.mcpServers as Record<string, unknown>)
        : {};
    parsed.mcpServers = {
      ...mcpServers,
      beatos: beatosServerConfig(repoRoot),
    };
    const backupPath = backupIfExists(configPath);
    atomicWrite(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
    return {
      ok: true,
      target: "claude_desktop",
      message: "Claude Desktop config updated. Restart Claude Desktop to load BeatOS.",
      path: configPath,
      backupPath,
    };
  } catch (error) {
    return {
      ok: false,
      target: "claude_desktop",
      error: error instanceof Error ? error.message : String(error),
      path: configPath,
    };
  }
}

function stripCodexBeatosBlock(input: string): string {
  const lines = input.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const match = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (match) {
      const table = match[1].trim();
      skipping = table === "mcp_servers.beatos" || table.startsWith("mcp_servers.beatos.");
    }
    if (!skipping) kept.push(line);
  }
  return kept.join("\n").trimEnd();
}

export function installCodexConfig({ configPath, repoRoot }: InstallFileOptions): McpInstallResult {
  try {
    const raw = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
    const next = [stripCodexBeatosBlock(raw), codexBlock(repoRoot)].filter(Boolean).join("\n\n");
    const backupPath = backupIfExists(configPath);
    atomicWrite(configPath, `${next}\n`);
    return {
      ok: true,
      target: "codex",
      message: "Codex config.toml updated. Restart Codex or open /mcp to load BeatOS.",
      path: configPath,
      backupPath,
    };
  } catch (error) {
    return {
      ok: false,
      target: "codex",
      error: error instanceof Error ? error.message : String(error),
      path: configPath,
    };
  }
}

export function buildClaudeCodeArgs(repoRoot: string): string[] {
  return [
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
    repoRoot,
    "beatos-mcp",
  ];
}

export function buildClaudeCodeRemoveArgs(): string[] {
  return ["mcp", "remove", "--scope", "user", "beatos"];
}

function runClaude(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

function claudeCodeUserServerExists(output: string): boolean {
  return output.includes("MCP server beatos already exists in user config");
}

export function installClaudeCodeConfig(repoRoot: string): Promise<McpInstallResult> {
  return runClaude(buildClaudeCodeArgs(repoRoot))
    .then(async ({ code, stdout, stderr }) => {
      const output = stderr || stdout;
      if (code === 0) {
        return {
          ok: true as const,
          target: "claude_code" as const,
          message: "Claude Code MCP server added. Restart Claude Code or run /mcp.",
        };
      }
      if (claudeCodeUserServerExists(output)) {
        const removed = await runClaude(buildClaudeCodeRemoveArgs());
        if (removed.code !== 0) {
          return {
            ok: false as const,
            target: "claude_code" as const,
            error: `claude mcp remove exited with code ${removed.code}. ${(
              removed.stderr || removed.stdout
            ).slice(-500)}`,
          };
        }
        const added = await runClaude(buildClaudeCodeArgs(repoRoot));
        if (added.code === 0) {
          return {
            ok: true as const,
            target: "claude_code" as const,
            message: "Claude Code MCP server updated. Restart Claude Code or run /mcp.",
          };
        }
        return {
          ok: false as const,
          target: "claude_code" as const,
          error: `claude mcp add exited with code ${added.code}. ${(
            added.stderr || added.stdout
          ).slice(-500)}`,
        };
      }
      return {
        ok: false as const,
        target: "claude_code" as const,
        error: `claude mcp add exited with code ${code}. ${output.slice(-500)}`,
      };
    })
    .catch((error: unknown) => ({
      ok: false as const,
      target: "claude_code" as const,
      error: `Claude Code CLI not available: ${error instanceof Error ? error.message : String(error)}`,
    }));
}

export function claudeDesktopConfigPath(
  homeDir: string,
  platform: NodeJS.Platform,
  appData?: string,
): string {
  if (platform === "win32") {
    return join(
      appData ?? join(homeDir, "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (platform === "darwin") {
    return join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  return join(homeDir, ".config", "Claude", "claude_desktop_config.json");
}

export function codexConfigPath(homeDir: string): string {
  return join(homeDir, ".codex", "config.toml");
}

export async function installMcpClientConfig(options: InstallOptions): Promise<McpInstallResult> {
  if (options.target === "claude_desktop") {
    return installClaudeDesktopConfig({
      configPath: claudeDesktopConfigPath(options.homeDir, options.platform, options.appData),
      repoRoot: options.repoRoot,
    });
  }
  if (options.target === "codex") {
    return installCodexConfig({
      configPath: codexConfigPath(options.homeDir),
      repoRoot: options.repoRoot,
    });
  }
  return installClaudeCodeConfig(options.repoRoot);
}
