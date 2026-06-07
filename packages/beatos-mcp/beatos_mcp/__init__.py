"""BeatOS MCP facade."""

from importlib.metadata import PackageNotFoundError, version as _pkg_version

try:
    # Single source of truth: the installed distribution version (kept in sync
    # with the app via scripts/bump-version.mjs → pyproject.toml). Avoids a
    # hand-maintained literal silently drifting from the real version, which
    # made `ping` report a stale version to every MCP client.
    __version__ = _pkg_version("beatos-mcp")
except PackageNotFoundError:  # not installed (e.g. raw source tree)
    __version__ = "0.0.0+unknown"

from beatos_mcp.server import app, mcp

__all__ = ["app", "mcp", "__version__"]
