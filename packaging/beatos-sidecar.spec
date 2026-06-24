# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the BeatOS sidecar (beatos-http + mounted beatos-mcp).

Produces a single self-contained sidecar that boots exactly like
`python -m beatos_http`: the FastAPI app with FastMCP mounted at /mcp, the
catalog DB, and the librosa analysis engine.

Distribution stance (CLAUDE.md rule 14 / approved EPIC-D1):
- LIBROSA ONLY. Essentia is AGPL and an opt-in dev extra — it is NEVER bundled.
  It is listed under `excludes` below as a guard so an accidentally-installed
  essentia can't be pulled into a shipped binary.

Build (from repo root, in the uv venv with the `build` group installed —
`uv pip install pyinstaller pyinstaller-hooks-contrib`):

    uv run pyinstaller packaging/beatos-sidecar.spec --noconfirm \
        --distpath dist --workpath build/.pyi-work

Output (onedir — chosen over onefile so librosa/numba don't re-extract and
re-JIT on every launch): dist/beatos-sidecar/beatos-sidecar
electron-builder ships this folder via extraResources (EPIC-D1e). The `dist/`
and `build/` work dirs are gitignored; only this spec is tracked.
"""
import os

from PyInstaller.utils.hooks import (
    collect_data_files,
    collect_submodules,
    copy_metadata,
)

# SPECPATH is injected by PyInstaller; the spec lives in <repo>/packaging/.
REPO_ROOT = os.path.dirname(SPECPATH)  # noqa: F821 (SPECPATH is a PyInstaller global)
ENTRY = os.path.join(
    REPO_ROOT, "packages", "beatos-http", "beatos_http", "__main__.py"
)

datas = []
binaries = []
hiddenimports = []

# --- BeatOS workspace packages: code + data + dist metadata ------------------
# collect_data_files pulls the migration .sql files (beatos_core/migrations/*)
# and the platform vocab maps (beatos_platforms/data/*/*.json), both resolved at
# runtime via __file__ / importlib.resources. copy_metadata keeps
# importlib.metadata.version(...) working (each package reads its own version).
for pkg, dist in [
    ("beatos_core", "beatos-core"),
    ("beatos_http", "beatos-http"),
    ("beatos_mcp", "beatos-mcp"),
    ("beatos_platforms", "beatos-platforms"),
]:
    hiddenimports += collect_submodules(pkg)
    datas += collect_data_files(pkg)
    try:
        datas += copy_metadata(dist)
    except Exception:
        pass

# --- Heavy / native third-party deps that need explicit collection ----------
# librosa lazy-loads much of its surface (lazy_loader), and its native audio +
# JIT stack (soundfile/libsndfile, soxr, audioread, numba, llvmlite) is invisible
# to static analysis. Collect submodules + data for each; missing optional ones
# are tolerated.
for pkg in [
    "librosa",
    "lazy_loader",
    "soundfile",
    "soxr",
    "audioread",
    "pooch",
    "numba",
    "llvmlite",
    "scipy",
    "sklearn",
    "joblib",
    "decorator",
    "msgpack",
    "mutagen",
    "mcp",
    "sse_starlette",
    "anyio",
]:
    try:
        hiddenimports += collect_submodules(pkg)
        datas += collect_data_files(pkg)
    except Exception:
        pass

# uvicorn[standard] selects its loop/protocol impls dynamically at runtime.
hiddenimports += [
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.loops.uvloop",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "pydantic",
    "pydantic_core",
    "asgi_correlation_id",
    "structlog",
]

block_cipher = None

a = Analysis(
    [ENTRY],
    pathex=[REPO_ROOT],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Essentia is AGPL and must never ship; exclude as a hard guard (rule 14).
    excludes=["essentia", "tkinter", "matplotlib", "pytest", "IPython"],
    noarchive=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="beatos-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="beatos-sidecar",
)
