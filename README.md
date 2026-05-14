# [PROJECT_NAME]

<!-- Replace this line with a one-sentence description of the project. -->

---

> **Note for template users:** The "About this template" section below is part of the template and should be removed once you've adapted this repo for a real project. Replace it — and this note — with content about your project.

---

## About this template

`averatec-harness-template` is a starting point for building a project harness: a structured repository that gives AI developers the context they need to operate consistently and safely within a codebase.

> **Designed for [Claude Code](https://claude.ai/code).** Skills in `.claude/skills/` are auto-loaded by Claude Code and trigger based on their `description` field. `CLAUDE.md` at the project root is also read automatically at session start.

### What is a harness?

A harness encodes how a project works — its architecture, conventions, and operational procedures — so an AI developer doesn't have to figure it out from scratch every session. Rather than relying on improvisation, the harness makes the right action easy and the wrong action obvious to avoid.

The core idea comes from how safety harnesses work physically: they don't restrict movement, they channel it. A well-written harness makes an AI developer more capable and less likely to cause unintended side effects.

### What's in this template

```
CLAUDE.md                      ← Entry point, auto-read by Claude Code
README.md                      ← This file
CHANGELOG.md                   ← Project change history
TODO.md                        ← Personal task list (gitignored in active projects)

.claude/
  skills/                      ← Auto-loaded by Claude Code
    setup/                     ← Environment setup
    git/                       ← Git operations
    memory/                    ← When and how to update memory files
    changelog/                 ← When and how to update CHANGELOG.md
    skill-creator/             ← How to create and improve skills

conventions/
  git-workflow.md
  testing.md

memory/
  rules.md                     ← Standing behavioral rules set by the user
  notes.md                     ← Discoveries and manually triggered notes
```

### How to use this template

1. Create a new repo from this template.
2. Replace all `[placeholder]` fields across these files:
   - `CLAUDE.md` — project name, description, stack, owner
   - `.claude/skills/setup/SKILL.md` and `.claude/skills/git/SKILL.md` — actual commands and steps
3. Update each skill with your project's real workflow.
4. Remove this "About this template" section from the README and replace it with your project's own documentation.
5. At the start of each AI session, point the AI developer to `CLAUDE.md`.

### Inspiration and references

- [Harness Engineering](https://openai.com/index/harness-engineering/)
- [Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
