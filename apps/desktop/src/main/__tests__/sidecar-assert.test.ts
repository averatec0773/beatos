import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { assertSidecarLayout } from "../sidecar-helpers";

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
