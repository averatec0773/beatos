# Aurora backdrop assets

Assets for the "aurora" ambient backdrop (`UnicornBackdrop.tsx`, Settings →
Appearance → Background → Aurora). Both are **bundled into the app JS** — the
runtime as a raw string (`?raw`), the scene as a parsed object — and handed to
the runtime as same-origin **Blob URLs** at runtime. That is the one load path
that works in all three host modes (Vite dev http, packaged Electron `file://`,
web SPA http) with **zero network calls** (local-first — see `CLAUDE.md`
rule 16). It relies on `blob:` being allowed in the renderer CSP
`script-src`/`connect-src` (`apps/desktop/src/renderer/index.html`).

## Files

- **`unicornStudio.umd.js`** — the [Unicorn Studio](https://www.unicorn.studio/)
  WebGL runtime, v2.2.5 (vendored from
  `cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.5/dist/unicornStudio.umd.js`).
  Imported as a raw string and injected via a same-origin Blob `<script>` (NOT
  the library's default inline-`<script>` path, which `script-src 'self'`
  blocks). MIT-distributed embed runtime; eslint-ignored (third-party minified).
- **`frosty-aurora.json`** — the exported scene ("Frosty Gradient (Remix)",
  format 2.2.5): 7 stacked 2D effect layers (gradient → noiseFill → flowField →
  liquify → coloration → shape → glyphDither), violet `#7001d7`. The compiled
  shaders carry Unicorn Studio's commercial license.

## Offline / CSP note

The raw export referenced one external texture
(`assets.unicorn.studio/media/glyphs/remix_horizontal_lines.png`, the
glyph-dither/shape atlas). It has been **inlined as a `data:` URI** inside the
JSON (~340 B PNG) so nothing is fetched cross-origin. If you re-export the scene
from Unicorn Studio, re-apply this step or the glyph layers will silently try
(and the CSP will block) that remote fetch.

## Updating the scene

1. Re-export from Unicorn Studio → replace `frosty-aurora.json`.
2. Re-inline any `https://assets.unicorn.studio/...` `*.src` values as `data:`
   URIs (see the offline note above).
3. Bump the runtime only if the export's format version outpaces v2.2.5.
