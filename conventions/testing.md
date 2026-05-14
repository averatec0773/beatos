# Testing

## Philosophy

- Tests are first-class code. Treat them with the same standards as production code.
- A test that passes without verifying behavior is worse than no test.
- Do not remove a failing test to make CI pass — fix the underlying issue.

## Test Types

| Type | When | Location |
|------|------|----------|
| Unit | Pure functions, isolated logic | FILL |
| Integration | Database, external API, file system | FILL |
| E2E | Critical user flows | FILL |

## Runner

FILL: Tool name, run-all command, single-test command, watch-mode command.

## Rules

- Test real behavior, not implementation. Assert on outputs and side effects.
- Each test is independent — no shared mutable state between tests.
- Tests must be deterministic. Flaky tests are treated as bugs.

## DO NOT

- Do not write tests that only assert a function was called.
- Do not use `sleep` or time-based delays — use proper async patterns.
- Do not commit tests with `.only`, `xit`, or `skip` without a tracking issue.
