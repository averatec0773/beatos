# Reference: NetEase 音乐人 beat-upload page DOM snapshot

Saved 2026-05-30 (tag modal was open at capture, so its buttons are included).
Used to calibrate the interaction-fill recipes in `beatos-platforms/.../netease/upload-form.json`.

Stable anchors: `[data-ne2e-name=...]` — beatGenre, beatKey, beatTagGroups, beatAuthConfig.
KEY = 3 `.ant-select-selection` under `[data-ne2e-name=beatKey]` in order 音名/调号/调式 (调式 is multi-select).
曲风 options are bilingual ("中文说唱 Chinese Hip Hop"). 调号 options: ♯ ♭ 无. 调式 options: English Major/Minor/…
