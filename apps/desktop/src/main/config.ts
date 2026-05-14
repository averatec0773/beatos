import { app } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";

export interface BeatosConfig {
  lastLibraryPath: string | null;
}

const DEFAULT_CONFIG: BeatosConfig = { lastLibraryPath: null };

function configPath(): string {
  return join(app.getPath("userData"), "config.json");
}

export function readConfig(): BeatosConfig {
  const p = configPath();
  if (!existsSync(p)) return { ...DEFAULT_CONFIG };
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    return { ...DEFAULT_CONFIG, ...data };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(partial: Partial<BeatosConfig>): void {
  const current = readConfig();
  const next = { ...current, ...partial };
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  // Atomic write: stage to .tmp, rename — survives crash mid-write.
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  renameSync(tmp, p);
}
