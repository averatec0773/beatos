import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOTS = ["src/renderer/src/components", "src/renderer/src/routes"];
const CJK = /[一-鿿　-〿＀-￯]/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) return [p];
    return [];
  });
}

describe("no hardcoded CJK in chrome", () => {
  it("components/ and routes/ contain no Chinese literals", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (CJK.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
