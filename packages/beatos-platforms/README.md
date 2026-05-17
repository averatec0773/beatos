# BeatOS platform adapters

Per-platform mapping from BeatOS canonical vocab to platform-specific identifiers.

## Layout

- `<platform>/` — one directory per supported platform
- `<platform>/genre-map.json` — `{ "<BeatOS English genre>": "<platform identifier>" }`
- `<platform>/mood-map.json` — same shape for moods

## Status

Currently stubbed. Mappings are empty `{}` which means **identity mapping** — BeatOS exports the canonical English label as-is.

First real adapter (e.g. publish-to-NetEase) lands in v0.2+. See `docs/superpowers/specs/future-netease-license-model.md`.
