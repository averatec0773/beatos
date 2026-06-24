import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { planLegacyMigration, copyDbWithSidecars, isCloudSyncedPath } from "../db-migrate";

describe("planLegacyMigration", () => {
  const defaultPath = "/data/userData/global.db";
  const legacyPath = "/home/me/Music/BeatOS/global.db";

  it("plans a copy when on the default path, default missing, legacy present", () => {
    const plan = planLegacyMigration({
      dbPath: defaultPath,
      defaultPath,
      legacyPath,
      exists: (p) => p === legacyPath,
    });
    expect(plan).toEqual({ from: legacyPath, to: defaultPath });
  });

  it("skips when the default DB already exists", () => {
    const plan = planLegacyMigration({
      dbPath: defaultPath,
      defaultPath,
      legacyPath,
      exists: () => true,
    });
    expect(plan).toBeNull();
  });

  it("skips when no legacy DB exists", () => {
    const plan = planLegacyMigration({
      dbPath: defaultPath,
      defaultPath,
      legacyPath,
      exists: () => false,
    });
    expect(plan).toBeNull();
  });

  it("skips when an explicit override path is in use (not the default)", () => {
    const plan = planLegacyMigration({
      dbPath: "/custom/place.db",
      defaultPath,
      legacyPath,
      exists: () => true,
    });
    expect(plan).toBeNull();
  });
});

describe("copyDbWithSidecars", () => {
  it("copies the DB plus -wal/-shm when present, into a fresh dir", () => {
    const root = mkdtempSync(join(tmpdir(), "db-migrate-"));
    mkdirSync(join(root, "src"), { recursive: true });
    const from = join(root, "src", "global.db");
    const to = join(root, "dst", "global.db"); // dst dir does not exist yet
    writeFileSync(from, "MAIN");
    writeFileSync(from + "-wal", "WAL");
    // no -shm on purpose: copy must tolerate a missing sidecar

    copyDbWithSidecars(from, to);

    expect(readFileSync(to, "utf8")).toBe("MAIN");
    expect(readFileSync(to + "-wal", "utf8")).toBe("WAL");
    expect(existsSync(to + "-shm")).toBe(false);
  });
});

describe("isCloudSyncedPath", () => {
  it("flags iCloud / Dropbox / OneDrive / Google Drive", () => {
    expect(isCloudSyncedPath("/Users/me/Library/Mobile Documents/com~apple~CloudDocs/global.db")).toBe(true);
    expect(isCloudSyncedPath("/Users/me/Dropbox/BeatOS/global.db")).toBe(true);
    expect(isCloudSyncedPath("/Users/me/OneDrive/global.db")).toBe(true);
    expect(isCloudSyncedPath("/Users/me/Google Drive/global.db")).toBe(true);
  });

  it("does not flag a normal userData path", () => {
    expect(isCloudSyncedPath("/Users/me/Library/Application Support/BeatOS/global.db")).toBe(false);
  });
});
