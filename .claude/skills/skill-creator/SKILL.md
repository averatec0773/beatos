---
name: skill-creator
description: Create new skills or improve existing ones in this harness. Use when adding a new skill file, rewriting an unclear skill, or improving how a skill triggers.
---

# Skill Creator

## When to use this skill

When adding a new skill to the harness, or when an existing skill is unclear, incomplete, or not triggering reliably.

---

## Creating a skill

### 1. Capture intent

Before writing anything, answer:

1. What should this skill enable the AI developer to do?
2. When exactly should it trigger? (what user action or context)
3. What does a successful outcome look like?

### 2. Write the SKILL.md

**Frontmatter fields:**

- `name` — identifier, kebab-case
- `description` — the primary trigger mechanism. Include what it does AND when to use it. Be specific enough that the AI picks this skill over doing something generic. Err toward being explicit rather than vague.

Start from the template: [references/skill-template.md](references/skill-template.md)

**Body sections** (use only what's needed):

```markdown
## When to use this skill
## Prerequisites
## Steps
## DO NOT
## Acceptance Criteria
```

**File structure** (when the skill needs supporting files):

```
skills/my-skill/
├── SKILL.md          ← instructions and pointers
├── references/       ← docs loaded into context as needed
└── scripts/          ← reusable scripts (not reinvented every run)
```

Keep SKILL.md under 150 lines. If it's longer, move detail into `references/` and link to it.

### 3. Writing guidelines

- Use imperative form: "Run X", "Check Y", not "You should run X".
- Explain *why* behind non-obvious steps. AI developers follow reasoning better than bare commands.
- Avoid MUST/ALWAYS/NEVER in caps — if something is important, explain why instead.
- Don't over-specify. Write for the general case, not just the one example you have in mind.

---

## Improving a skill

When a skill produces bad results or doesn't trigger:

**If outputs are wrong:**
1. Read the existing skill and identify what instruction led to the bad output.
2. Clarify the *why*, not just the rule. Rewrite the relevant section.
3. Remove anything that isn't pulling its weight — lean prompts outperform padded ones.

**If the skill doesn't trigger:**
1. Rewrite the `description` field to be more specific about trigger conditions.
2. Add concrete examples of user phrases that should invoke it.
3. Include adjacent contexts where this skill should win over a generic response.

---

## Checklist before committing a skill

- [ ] `description` covers when to trigger, not just what it does
- [ ] Steps have enough context that a new AI developer can follow them without guessing
- [ ] `dangerous: true` set in metadata if any step is irreversible
- [ ] Skill file is placed under `.claude/skills/<name>/SKILL.md`
