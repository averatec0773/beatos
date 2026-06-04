# Pro submodule — build notes

Publishing is a BeatOS **Pro** feature. The engine (`beatos-publish`) and platform
recipes live in the private repo `beatos-pro`, mounted here as a git submodule at
`packages/pro/`. The free build works without it (`pro_available()` → greyed-out UI,
`/api/publish` → 402, MCP `publish_track` not registered).

## Buyout / Pro dev build (submodule present)

The public uv workspace does **not** include the engine as a member: a `packages/pro/*`
glob makes uv error because the submodule root also holds non-package dirs (`specs/`,
`MEMORY.md`) — uv requires every glob-matched path to contain a `pyproject.toml`. So
after the normal sync, install the engine into the venv explicitly:

```bash
git submodule update --init packages/pro
uv sync
# Install the engine editable. --no-deps because beatos-core + pydantic are already in
# the venv (public workspace members), and beatos-pro's own pyproject carries a
# standalone-testing path source for beatos-core that resolves wrong when nested.
uv pip install -e packages/pro/beatos-publish --no-deps
uv pip install "patchright>=1.40"   # --no-deps skipped it; pin to the engine's floor
patchright install chromium   # once per machine — the browser the engine drives
```

After this, `pro_available()` returns `True`, `/api/publish` works, the MCP
`publish_track` tool registers, and the renderer enables the publish entry.

## Free build (no submodule)

```bash
uv sync   # engine absent; everything degrades gracefully
```
