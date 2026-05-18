---
name: harness
description: Keep harness docs in sync with shipped code. **MANDATORY before any `git tag -a vX.Y.Z`, `git push origin v*`, or when the user says "ship / release / cut vX.X.X"** — verify `CHANGELOG.md` has an entry for that exact version, prune the matching item from `ROADMAP.md`, and review whether `conventions/` needs an update. Also invoke discretionarily after committing code that adds a new feature, a new structural component, a new pattern reused 3+ times, or a breaking change. Skip for typo fixes / internal refactors with no external impact. Always tell the user one line per file touched.
metadata:
  version: 2.0.0
  category: workflow
  dangerous: false
---

# Harness sync

Keeps the four canonical agent-instruction files aligned with what actually shipped: `CHANGELOG.md`, `ROADMAP.md`, `conventions/architecture.md`, `conventions/design-direction.md`. The harness IS the agent's spec — drift here means future sessions get stale context.

## When to use

**Mandatory** (no judgment — run before the action):
- About to `git tag -a vX.Y.Z …`
- About to `git push origin vX.Y.Z`
- User says "ship", "release", "cut v0.0.X", "tag and push", or equivalent

**Discretionary** (use judgment after a meaningful commit):
- New user-facing feature, behavior, or bug fix → CHANGELOG candidate
- New module / migration / IPC channel / cross-cutting component → architecture.md candidate
- New UI pattern reused or about to be reused in 3+ places → design-direction.md candidate
- Breaking change → CHANGELOG + migration note required
- Skip entirely: typo fixes, internal refactors with no external impact, comment-only changes

## What each file owns

| File | Purpose | When to update |
|---|---|---|
| `CHANGELOG.md` | What shipped, per version, from a user perspective | Every shipped version. Bug fixes, features, breaking changes, harness updates (prefix `[harness]`). |
| `ROADMAP.md` | What's planned, by version. Past versions live in CHANGELOG. | When a version ships → remove or strike the corresponding item. When scope shifts → update the candidate bullets. |
| `conventions/architecture.md` | Code-level layering rules + per-version capability tables + "what NOT to change" | When a version introduces a new module, migration, IPC channel, cross-cutting component, or layering rule. Add a new `### v0.0.X — <theme>` table to the v0.0.6→v0.0.X section. |
| `conventions/design-direction.md` | Canonical UI direction: tokens, components, patterns | Only when a real screen reveals a new token, a pattern is reused in 3+ screens, or the user reverses a prior direction. Not per-version. |

Vocab files (`vocab-genre-mood-scene.md`) and platform maps update only when an external source (NetEase, BeatStars) changes — not on every ship.

## Steps (ship path — mandatory triggers)

1. **Identify the version** (`vX.Y.Z`) and the commits in it: `git log <prev-tag>..HEAD --oneline`.
2. **Update `CHANGELOG.md`** following the format below. Newest entry at top under the file header.
3. **Update `ROADMAP.md`**:
   - If a roadmap item shipped, remove the bullet (or move to a `## Shipped` line of that section, then prune at the next version cut). Default: remove.
   - If only part of an item shipped, rewrite the remaining sub-bullets.
   - If the version contained scope outside the roadmap, mention it briefly in CHANGELOG only — don't backfill ROADMAP.
4. **Check conventions/**:
   - Did this version introduce a new module / migration / IPC channel / cross-cutting helper? → add a row to `conventions/architecture.md` per-version table (or create the version's table if it's a new minor).
   - Did this version introduce a UI pattern that's already shipped in 3+ places? → add to `conventions/design-direction.md`. Don't add speculative patterns.
   - Neither applies → state that explicitly to the user ("conventions unchanged this version").
5. **Tell the user** one line per file touched: `CHANGELOG: added v0.0.X entry · ROADMAP: pruned auto-save bullet · architecture: added v0.0.X row · design-direction: unchanged`.

## Steps (commit path — discretionary)

After a non-trivial commit, run the same check in lightweight form:

1. Did the commit add user-facing behavior worth a CHANGELOG bullet in the unreleased section?
2. Did the commit add a new structural element worth an architecture row?
3. Did the commit reveal a pattern worth design-direction codification?

If yes to any → make the edit in the same session, mention it. If no to all → don't fabricate work.

## CHANGELOG format

[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). New entries at top. Match v0.0.14 / v0.0.13 style:

```
## [0.X.Y] - YYYY-MM-DD — Optional theme

### Architecture / Added / Changed / Fixed / Removed / Migration / Notes
- Bullets ≤ ~100 chars per line; long lines OK over many short ones.
- Backticks for code refs: `/api/...`, `migrations/00X_*.sql`, file paths.
- User-facing framing — "what changed", not "what the commit did".
```

Section order when present: `Architecture` → `Added` → `Changed` → `Fixed` → `Removed` → `Migration` → `Notes`. Include only what applies.

## DO NOT

- Do not vague-describe ("fixed bug" — useless). State the symptom and what was changed.
- Do not duplicate the same point between `Changed` and `Notes`.
- Do not auto-archive ROADMAP items to a history list — CHANGELOG is already that history.
- Do not invent architecture rows for changes that don't actually introduce a new structural element. The per-version tables exist to make drift visible; padding them defeats the purpose.
- Do not add design-direction entries for hypothetical patterns. Wait for 3+ shipped instances.
- Do not bump version numbers, create tags, or push tags as part of this skill — those are the user's actions; this skill prepares the docs that gate them.

## Acceptance criteria

- [ ] CHANGELOG entry exists for the version about to ship, dated, with user-perspective bullets
- [ ] Breaking changes have migration notes
- [ ] ROADMAP no longer claims as pending anything that just shipped
- [ ] conventions/architecture.md reflects any new structural additions (or explicit no-change confirmation given)
- [ ] conventions/design-direction.md updated only if a new pattern crossed the 3-shipped-instances threshold
- [ ] One-line summary told to the user per file touched
