import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  assertSidecarLayout,
  assertSidecarBinary,
  resolveSidecarSpawn,
} from "../sidecar-helpers";

describe("assertSidecarLayout", () => {
  it("returns silently when pyproject.toml exists at the given root", () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-assert-ok-"));
    writeFileSync(join(root, "pyproject.toml"), "[project]\nname='x'\n");
    expect(() => assertSidecarLayout(root, "/fake/__dirname")).not.toThrow();
  });

  it("throws a diagnostic error mentioning failure, layout, and __dirname when pyproject.toml is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-assert-bad-"));
    let caught: unknown = null;
    try {
      assertSidecarLayout(root, "/fake/__dirname");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const msg = (caught as Error).message;
    expect(msg).toMatch(/Sidecar bootstrap failed/);
    expect(msg).toMatch(/electron-builder layout/);
    expect(msg).toMatch(/__dirname=\/fake\/__dirname/);
  });
});

describe("resolveSidecarSpawn", () => {
  it("runs uv from source in dev", () => {
    const s = resolveSidecarSpawn({ isDev: true, resourcesPath: "/whatever" });
    expect(s.command).toBe("uv");
    expect(s.args).toEqual(["run", "python", "-m", "beatos_http"]);
  });

  it("points at the bundled binary under resources when packaged (posix)", () => {
    const s = resolveSidecarSpawn({
      isDev: false,
      resourcesPath: "/app/Resources",
      platform: "darwin",
    });
    expect(s.command).toBe("/app/Resources/beatos-sidecar/beatos-sidecar");
    expect(s.args).toEqual([]);
  });

  it("adds the .exe suffix on win32", () => {
    const s = resolveSidecarSpawn({
      isDev: false,
      resourcesPath: "C:\\app\\resources",
      platform: "win32",
    });
    expect(s.command).toMatch(/beatos-sidecar\.exe$/);
  });
});

describe("assertSidecarBinary", () => {
  it("returns silently when the binary exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "sidecar-bin-ok-"));
    const bin = join(dir, "beatos-sidecar");
    writeFileSync(bin, "#!/bin/sh\n");
    expect(() => assertSidecarBinary(bin)).not.toThrow();
  });

  it("throws a diagnostic error mentioning extraResources when missing", () => {
    let caught: unknown = null;
    try {
      assertSidecarBinary("/no/such/beatos-sidecar");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/Sidecar bootstrap failed/);
    expect((caught as Error).message).toMatch(/extraResources/);
  });
});
