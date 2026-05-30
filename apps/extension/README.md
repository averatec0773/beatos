# BeatOS Uploader (browser extension)

Auto-fills a platform upload form with metadata staged from BeatOS.
You drag the audio file in and click submit yourself. The extension never submits.

- **Phase 1** — native text fields (Beat名称 / BPM / Beat说明).
- **Phase 2 (v0.0.38)** — also fills the click-to-open Ant widgets: 曲风 (single-select), KEY (音名/调号/调式, decomposed from e.g. "F# minor"), 说明标签 (matches mood/tags against NetEase's scene-tag buttons), 价格 (授权方式 modal). 曲风/KEY fill reliably; 说明标签/价格 are best-effort — anything not matched is listed in the overlay for you to set by hand.

## Install (load unpacked)

1. `cd apps/extension && npm install && npm run build`
2. Chrome → `chrome://extensions` → enable Developer mode → "Load unpacked" → select `apps/extension/dist`.

## Use

1. Start BeatOS (the sidecar serves the fixed inject port **48923**).
2. In BeatOS, open a track's 导出 dialog → pick 网易云 → click **发送到上传页**.
3. Switch to the NetEase upload page (logged in). The extension fills metadata and
   shows an overlay (filled count + any unmatched fields + which audio file to drag).
4. Drag the audio file, review, click submit.

## Fixed port

The extension talks to `http://127.0.0.1:48923` (`BEATOS_INJECT_PORT` on the sidecar).
If that port is in use at sidecar startup, extension upload is disabled that session
(BeatOS logs a warning); the main app is unaffected.

## Selectors

Field→selector mappings live in `beatos-platforms/data/netease/upload-form.json`
(served via `GET /api/inject/form-map/netease`). When NetEase redesigns the page,
fix the JSON — no extension reload needed for selector changes.
