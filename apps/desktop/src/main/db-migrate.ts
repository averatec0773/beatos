import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * One-time relocation of the catalog DB from the legacy `~/Music/BeatOS` home to
 * the app's userData dir (off cloud-synced folders; v0.0.49+ default).
 *
 * The copy is gated to the DEFAULT path only: if the user set an explicit DB
 * path (env or Settings), we respect it verbatim and never migrate. We COPY
 * (never move) so the legacy file stays untouched as a backup.
 */

export interface MigrationPlan {
  from: string;
  to: string;
}

/**
 * Decide whether to copy a legacy library into the new default location.
 * Returns the plan only when: we're using the default path (no override),
 * the new path has no DB yet, and a legacy DB exists. Otherwise null.
 */
export function planLegacyMigration(opts: {
  dbPath: string;
  defaultPath: string;
  legacyPath: string;
  exists?: (p: string) => boolean;
}): MigrationPlan | null {
  const exists = opts.exists ?? existsSync;
  // An explicit override (env / Settings) resolves to a non-default path — leave it alone.
  if (opts.dbPath !== opts.defaultPath) return null;
  if (exists(opts.defaultPath)) return null;
  if (!exists(opts.legacyPath)) return null;
  return { from: opts.legacyPath, to: opts.defaultPath };
}

/**
 * Copy a SQLite DB and its sidecar files (-wal / -shm) if present, so an
 * un-checkpointed write-ahead log isn't left behind. Creates the target dir.
 */
export function copyDbWithSidecars(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(from + suffix)) copyFileSync(from + suffix, to + suffix);
  }
}

// Common cloud-sync roots. SQLite in a synced folder risks DB corruption, so we
// warn (not block) when the resolved path lands inside one.
const CLOUD_DIR_PATTERNS: RegExp[] = [
  /\/Library\/Mobile Documents\//i, // iCloud Drive
  /\/Dropbox\//i,
  /\/OneDrive/i,
  /\/Google Drive\//i,
  /\\Dropbox\\/i,
  /\\OneDrive/i,
];

export function isCloudSyncedPath(p: string): boolean {
  return CLOUD_DIR_PATTERNS.some((re) => re.test(p));
}
