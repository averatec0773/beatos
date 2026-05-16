import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { assertSidecarBinary } from "../index-helpers";

describe("assertSidecarBinary", () => {
  it("returns silently when pyproject.toml exists at the given root", () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-assert-ok-"));
    writeFileSync(join(root, "pyproject.toml"), "[project]\nname='x'\n");
    expect(() => assertSidecarBinary(root, "/fake/__dirname")).not.toThrow();
  });

  it("throws a diagnostic error when pyproject.toml is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "sidecar-assert-bad-"));
    expect(() => assertSidecarBinary(root, "/fake/__dirname")).toThrow(
      /Sidecar bootstrap failed/
    );
    expect(() => assertSidecarBinary(root, "/fake/__dirname")).toThrow(
      /electron-builder layout/
    );
    expect(() => assertSidecarBinary(root, "/fake/__dirname")).toThrow(
      /__dirname=\/fake\/__dirname/
    );
  });
});
