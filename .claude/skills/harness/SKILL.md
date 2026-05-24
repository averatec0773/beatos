---
name: harness
description: Pre-commit doc sync check. Invoke proactively right before any non-trivial `git commit` to decide whether `CHANGELOG.md`, `conventions/`, `CLAUDE.md`, or `README.md` need a small targeted update reflecting the staged change. Also invoke when the user explicitly asks ("harness", "doc check", "check before commit", "sync docs", or equivalent in any language). Skip for typo / comment / formatting / test-only commits and for commits that only touch `.claude/` or `memory/`. "Nothing needed" is a valid result; do not invent work.
metadata:
  version: 4.0.0
  category: workflow
  dangerous: false
---

# Harness — pre-commit doc sync

Lightweight check that runs right before commit. The goal is keeping four agent-facing docs aligned with reality. Self-triggered on non-trivial commits; the user can also invoke explicitly.

## When to use

Run when **either** is true:
- About to call `git commit` and the staged diff touches source code, config, or user-visible behavior.
- The user asks: "harness" / "doc check" / "check before commit" / "sync docs" / equivalent.

Skip when:
- The diff is typo-only, comment-only, formatting-only, or pure test plumbing.
- The diff only touches `.claude/`, `memory/`, or other agent-harness files.
- This skill already ran on the same staged set earlier in the session.

When the diff sits in the gray zone, ask the user one line ("harness check before commit? yes / skip") and default to skip if the change is small and self-contained.

## What to check

Read `git status` + `git diff` (staged and unstaged). Then walk the table once:

| File | Update when … | Skip when … |
|---|---|---|
| `CHANGELOG.md` | User-visible change (feature, bug fix, behavior change). Add one bullet to the unreleased section. | Internal refactor, tests, docs-only, typos. |
| `conventions/architecture.md` | New module, migration, IPC channel, cross-cutting helper, or layering rule. | No structural change. |
| `conventions/design-direction.md` | A UI pattern just hit its 3rd shipped instance. | Pattern is still 1–2 instances. |
| `CLAUDE.md` | Change exposed a gotcha a fresh agent would not have known. | Normal feature work. |
| `README.md` | What BeatOS *is* / how to install / how to run just changed. | Incremental polish, internal-only changes. |

Each row is independent. "Skip" is the right answer most of the time — these docs are not meant to log every commit.

## Steps

1. Run `git status` + `git diff` to cover both staged and working tree.
2. For each row in the table, decide update or skip. Bias toward skip when in doubt.
3. Make any needed edits — small, on-topic, no rewrites for polish.
4. **Version-consistency read-only check**: confirm `apps/desktop/package.json` and the four `pyproject.toml` files (root + three under `packages/`) all carry the same version string. If they disagree, surface the drift to the user and suggest `node scripts/bump-version.mjs <version>` — do NOT bump yourself.
5. Report one line per file, e.g. `CHANGELOG: + auto-save bullet · architecture: unchanged · design-direction: unchanged · CLAUDE: unchanged · README: unchanged · versions: aligned`.
6. Proceed with the commit.

## DO NOT

- Don't rewrite anything for polish; this is sync, not editorial.
- Don't pad files to feel productive — "all unchanged" is a fine result.
- Don't loop on every micro-commit; respect the skip rules above.

## Acceptance criteria

- [ ] All five files in the table considered (even if the answer is skip).
- [ ] Any edits are small, on-topic, additive.
- [ ] One-line per-file summary delivered to the user before the commit lands.
