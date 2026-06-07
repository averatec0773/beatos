"""BeatOS FastAPI facade."""

from importlib.metadata import PackageNotFoundError, version as _pkg_version

try:
    # Resolved from the installed distribution so it tracks the real version
    # instead of a hand-maintained literal that drifts (see beatos_mcp).
    __version__ = _pkg_version("beatos-http")
except PackageNotFoundError:
    __version__ = "0.0.0+unknown"
