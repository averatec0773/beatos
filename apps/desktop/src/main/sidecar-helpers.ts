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
        `electron-builder layout may have changed.`
    );
  }
}
