import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOTS = ["src/renderer/src/components", "src/renderer/src/routes"];

// CJK detection by code-point range, using hex literals so THIS guard file
// stays free of literal CJK and irregular whitespace (which would otherwise
// self-trip eslint's no-irregular-whitespace rule). Ranges: Han ideographs,
// CJK symbols/punctuation, and fullwidth/halfwidth forms.
const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x4e00, 0x9fff],
  [0x3000, 0x303f],
  [0xff00, 0xffef],
];

function hasCJK(line: string): boolean {
  for (const ch of line) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && CJK_RANGES.some(([a, b]) => cp >= a && cp <= b)) return true;
  }
  return false;
}

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
            if (hasCJK(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
