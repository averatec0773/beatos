#!/usr/bin/env node
// Bump every version source file to match a target version.
// `apps/desktop/package.json` is the canonical source of truth — invoking
// this with no arg syncs the four Python pyproject.toml files to whatever
// `package.json` currently says. Pass a version to set all five at once.
//
//   node scripts/bump-version.mjs            # sync pyprojects → package.json
//   node scripts/bump-version.mjs 0.0.27.2   # set all five files
//   node scripts/bump-version.mjs --check    # read-only: exit 1 on any drift

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const desktopPkg = resolve(root, "apps/desktop/package.json");
const pyprojects = [
  resolve(root, "pyproject.toml"),
  resolve(root, "packages/beatos-core/pyproject.toml"),
  resolve(root, "packages/beatos-http/pyproject.toml"),
  resolve(root, "packages/beatos-mcp/pyproject.toml"),
];

const arg = process.argv[2];
const checkOnly = arg === "--check";

if (checkOnly) {
  const rows = [
    ["apps/desktop/package.json", JSON.parse(readFileSync(desktopPkg, "utf8")).version],
  ];
  for (const f of pyprojects) {
    const m = readFileSync(f, "utf8").match(/^version = "(.*)"$/m);
    rows.push([f.replace(root + "/", ""), m ? m[1] : "(none)"]);
  }
  for (const [f, v] of rows) console.log(`  ${v}  ${f}`);
  const versions = new Set(rows.map((r) => r[1]));
  if (versions.size === 1) {
    console.log(`aligned at ${[...versions][0]}`);
    process.exit(0);
  }
  console.error("version drift detected — run: node scripts/bump-version.mjs <version>");
  process.exit(1);
}

const target = arg ?? JSON.parse(readFileSync(desktopPkg, "utf8")).version;

if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(target)) {
  console.error(`bad version: ${target}`);
  process.exit(1);
}

function setPkg(file) {
  const j = JSON.parse(readFileSync(file, "utf8"));
  if (j.version === target) return false;
  j.version = target;
  writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
  return true;
}

function setPyproject(file) {
  const src = readFileSync(file, "utf8");
  const next = src.replace(/^version = ".*"$/m, `version = "${target}"`);
  if (next === src) return false;
  writeFileSync(file, next);
  return true;
}

const changed = [];
if (setPkg(desktopPkg)) changed.push("apps/desktop/package.json");
for (const f of pyprojects) {
  if (setPyproject(f)) changed.push(f.replace(root + "/", ""));
}

console.log(`target ${target}`);
if (changed.length === 0) console.log("all files already aligned");
else for (const f of changed) console.log(`  ✓ ${f}`);
