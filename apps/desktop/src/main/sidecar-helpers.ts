import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Fail-fast guard. The sidecar spawn assumes the repo layout: pyproject.toml
 * at repoRoot. If electron-builder ever ships without it (layout drift), the
 * spawn would otherwise hang on the 5s handshake before failing with a
 * cryptic error. Throw immediately with diagnostic context instead.
 */
export function assertSidecarLayout(repoRoot: string, dirname: string): void {
  const pyprojectPath = join(repoRoot, "pyproject.toml");
  if (!existsSync(pyprojectPath)) {
    throw new Error(
      `Sidecar bootstrap failed: pyproject.toml not found at ${pyprojectPath}. ` +
        `Computed repoRoot from __dirname=${dirname}. ` +
        `electron-builder layout may have changed.`,
    );
  }
}

export interface SidecarSpawn {
  command: string;
  args: string[];
}

/**
 * Resolve how to launch the sidecar.
 * - dev (and the built-but-unpackaged smoke, where `is.dev === !app.isPackaged`
 *   is true): run from source via `uv run python -m beatos_http`.
 * - packaged: the bundled PyInstaller binary shipped under `resources/` by
 *   electron-builder extraResources (process.resourcesPath), no Python / uv
 *   needed. Windows gets the `.exe` suffix.
 */
export function resolveSidecarSpawn(opts: {
  isDev: boolean;
  resourcesPath: string;
  platform?: NodeJS.Platform;
}): SidecarSpawn {
  if (opts.isDev) {
    return { command: "uv", args: ["run", "python", "-m", "beatos_http"] };
  }
  const platform = opts.platform ?? process.platform;
  const exe = platform === "win32" ? ".exe" : "";
  return {
    command: join(opts.resourcesPath, "beatos-sidecar", `beatos-sidecar${exe}`),
    args: [],
  };
}

/**
 * Packaged-mode guard, mirroring assertSidecarLayout for dev: the bundled
 * binary must exist, else the spawn would fail with a cryptic ENOENT after the
 * handshake timeout.
 */
export function assertSidecarBinary(binPath: string): void {
  if (!existsSync(binPath)) {
    throw new Error(
      `Sidecar bootstrap failed: bundled binary not found at ${binPath}. ` +
        `electron-builder extraResources may not have shipped dist/beatos-sidecar/.`,
    );
  }
}
