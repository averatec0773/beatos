# Pro submodule: engine install for mounted builds

When the private `pro` submodule is mounted at `packages/pro/`, the public
uv workspace does **not** include it via a glob.

**Why:** uv requires every path matched by a `members` glob to contain a
`pyproject.toml`.  `packages/pro/` holds non-package files (`MEMORY.md`,
`specs/`) alongside the actual Python package directory — so a glob
`packages/pro/*` causes uv to error on the non-package paths even when the
submodule is absent.

## Installing the engine (pro / paid build)

After the submodule is initialised (`git submodule update --init packages/pro`)
and `uv sync` has completed, install the engine directly into the project venv:

```bash
uv pip install -e packages/pro/beatos-publish
```

This makes `beatos_publish` importable and `beatos_http.pro.pro_available()`
returns `True`.

## Free / open build (default)

No extra steps.  `uv sync` installs only the four public workspace packages.
`beatos_http.pro.pro_available()` returns `False` and all engine-gated
features are hidden in the UI.
