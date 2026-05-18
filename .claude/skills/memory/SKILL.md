---
name: memory
description: Use when the user explicitly asks to remember something, sets a rule, or corrects agent behavior. Also use when a meaningful discovery is made that a fresh agent would not derive from the code or git history. Always mention to the user when writing to memory.
metadata:
  version: 1.0.0
  category: workflow
  dangerous: false
---

# Memory

## Which file to update

| What to record | File |
|----------------|------|
| User sets a rule or corrects agent behavior | `memory/rules.md` |
| Discovery, gotcha, or anything user asks to note | `memory/notes.md` |

## rules.md

- Write immediately when the user gives a correction or sets a rule.
- Format: `- [rule] — [reason or context]`
- Only record what the user explicitly instructs — do not add rules on your own initiative.

## notes.md

- Write when you discover something not derivable from the code or git history.
- Write when the user explicitly asks you to record something.
- Format: `[YYYY-MM-DD] — [what was found or noted]`

## DO NOT

- Do not record facts already visible in the code or git history.
- Do not add to `rules.md` without explicit user instruction.
- Do not batch updates — write at the moment of discovery or instruction.

## After writing

Always tell the user what was recorded and to which file, in one line.
