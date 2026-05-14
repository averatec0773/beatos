# Project Harness

## Project

<!-- TEMPLATE STATE: fields below are placeholders. If any field still reads [like this], the harness has not been configured for a real project yet. Do not proceed with project work until these are filled in. -->

**Name:** [PROJECT_NAME]
**Description:** [What this project does]
**Stack:** [Language / framework / infra]
**Owner:** [Team or person]

> All files except `README.md` are agent instructions. Treat them as authoritative.

## Session Start Protocol

At the start of every session:

1. Run `git fetch && git status` — confirm the local repo is up to date with remote. If behind, pull before proceeding.
2. Run `git log --oneline -10` — orient to recent history.
3. Confirm working directory before any write or destructive operation.

<!-- FILL: Add project-specific checks (e.g., verify a service is running, check env vars). -->

## Core Rules

1. Read the skill file before any dangerous or irreversible operation.
2. Follow conventions. Do not invent new patterns unless explicitly asked.
3. Read `memory/rules.md` and apply all rules for the duration of this session.

## Settings

- Shared permissions → [.claude/settings.json](.claude/settings.json)
- Personal overrides → `.claude/settings.local.json` (gitignored, auto-created on first session from `.claude/settings.local.json.example`)

## Index

### Skills
<!-- Auto-loaded by Claude Code based on each skill's description field. -->
- [setup](.claude/skills/setup/SKILL.md)
- [git](.claude/skills/git/SKILL.md)
- [memory](.claude/skills/memory/SKILL.md)
- [changelog](.claude/skills/changelog/SKILL.md)
- [skill-creator](.claude/skills/skill-creator/SKILL.md)

### Conventions
- [architecture](conventions/architecture.md)
- [git-workflow](conventions/git-workflow.md)
- [testing](conventions/testing.md)

### Memory
- [rules](memory/rules.md)
- [notes](memory/notes.md)
