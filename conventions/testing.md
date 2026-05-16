# Testing

## Philosophy

- Tests are first-class code. Treat them with the same standards as production code.
- A test that passes without verifying behavior is worse than no test.
- Do not remove a failing test to make CI pass — fix the underlying issue.

## Test Types

| Type | When | Location |
|------|------|----------|
| Unit (Python) | Pure functions, isolated logic in core | `packages/beatos-core/tests/` |
| Unit (TS) | Zustand selectors, parsers, pure helpers | `apps/desktop/src/renderer/src/__tests__/`, `apps/desktop/src/main/__tests__/`, `apps/desktop/src/shared/__tests__/` |
| Component | React Testing Library + jsdom | `apps/desktop/src/renderer/src/__tests__/*.test.tsx` |
| Integration (HTTP) | FastAPI routes via `TestClient` | `packages/beatos-http/tests/test_*_routes.py` |
| Integration (subprocess) | Real sidecar boot, handshake, /health, JSONL output | `packages/beatos-http/tests/test_boot_integration.py` |
| Smoke (E2E) | Built Electron app via Playwright `_electron`; asserts boot + zero ERROR JSONL | `apps/desktop/scripts/smoke.mjs` |

## Runner

- **Renderer/main unit + component:** `cd apps/desktop && npx vitest run` (single run), `npx vitest` (watch)
- **Single renderer test:** `npx vitest run path/to/file.test.ts`
- **Sidecar:** `cd packages/beatos-http && uv run pytest -q`
- **Core:** `cd packages/beatos-core && uv run pytest -q`
- **Smoke:** `cd apps/desktop && npm run build && npm run smoke` — milestone gate, not per-commit
- **Typecheck both projects:** `cd apps/desktop && npm run typecheck`

## Rules

- Test real behavior, not implementation. Assert on outputs and side effects.
- Each test is independent — no shared mutable state between tests.
- Tests must be deterministic. Flaky tests are treated as bugs.
- For UI-touching changes, the smoke harness is part of acceptance (per `memory/feedback_run_the_tools_you_built.md`).
- For Zustand state, NEVER call `.filter/.map/.find` inside a selector — derive in the component with `useMemo` (per `memory/feedback_zustand_stable_selectors.md`).

## DO NOT

- Do not write tests that only assert a function was called.
- Do not use `sleep` or time-based delays — use proper async patterns.
- Do not commit tests with `.only`, `xit`, or `skip` without a tracking issue.
- Do not assert on internal Zustand state from outside the store; assert via the store's public methods or rendered output.
- Do not skip the smoke harness on UI-touching changes — it exists precisely so the agent can self-verify without asking the user.
