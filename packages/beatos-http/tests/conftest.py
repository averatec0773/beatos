"""Per-test isolation for the FastMCP session-manager singleton.

The mcp library's ``StreamableHTTPSessionManager`` is designed to be created
once per process and run exactly once across that process's lifetime
(``run()`` raises if called twice; see mcp 1.27.1
``streamable_http_manager.py``).  ``beatos_mcp.server.mcp`` is a module-level
``FastMCP`` instance, so its ``session_manager`` is a process-wide singleton.

Our ``beatos_http.app.lifespan`` already accommodates this by guarding
``sm.run()`` with ``if not sm._has_started`` — correct for the real sidecar,
which only has one lifespan per process.  But every test that uses
``app.router.lifespan_context(app)`` (``test_token_routes``,
``test_token_concurrent``, ``test_handlers_*``, ``test_mcp_mount``) opens a
new lifespan.  After the first one exits the singleton is left in a
half-initialised state: ``_has_started=True`` but ``_task_group=None``.  The
next lifespan sees ``_has_started`` and skips ``run()``, so any subsequent
request that actually hits ``/mcp`` fails with::

    RuntimeError: Task group is not initialized. Make sure to use run().

Resetting the singleton between tests lets each lifespan start a fresh task
group, so ``test_mcp_mount`` works regardless of collection order and future
``test_handlers_*.py`` files (Tasks 4-7) can use the same lifespan-context
fixture pattern without per-file workarounds.

Pinned to ``mcp>=1.27,<1.28`` in ``packages/beatos-mcp/pyproject.toml`` —
revisit when bumping mcp if the private attrs ever change.
"""
from __future__ import annotations

import pytest

from beatos_mcp.server import mcp as _mcp


@pytest.fixture(autouse=True)
def _reset_mcp_session_manager():
    """Reset the FastMCP session-manager singleton around each test."""
    sm = _mcp.session_manager
    sm._has_started = False
    sm._task_group = None
    yield
    sm._has_started = False
    sm._task_group = None


@pytest.fixture(autouse=True)
def _disable_demo_seed(monkeypatch):
    """Stub the first-launch demo seed that app.lifespan runs on startup.

    Every test that opens ``app.router.lifespan_context(app)`` against a fresh
    temp DB would otherwise trigger a real seed (copying the bundled ~20 MB
    assets + inserting three tracks), which is slow and would surprise any future
    test that assumes an empty baseline. ``test_seed_demo.py`` exercises the
    real function directly (not via the app), so it is unaffected by this."""
    async def _noop(*_args, **_kwargs):
        return False

    monkeypatch.setattr("beatos_http.app.seed_demo_if_needed", _noop)
    yield
