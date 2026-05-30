# BeatOS Uploader (browser extension)

Phase 1: auto-fills a platform upload form with metadata staged from BeatOS.
You drag the audio file in and click submit yourself. The extension never submits.

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
