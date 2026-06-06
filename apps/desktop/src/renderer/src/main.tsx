import "./assets/main.css";
import "./i18n";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Stable debug surface — kept in production builds on purpose.
// `scripts/smoke/player.mjs` and `scripts/diagnose-playback.mjs` read
// `window.__beatos.engine()` to assert playback health against the built
// app, so this must NOT be gated behind `import.meta.env.DEV`. Also serves
// as the ad-hoc DevTools inspection surface (`__beatos.player()` / `.tracks()`
// / etc. return live store snapshots). Lazy require avoids circular deps.
if (typeof window !== "undefined") {
  void (async () => {
    const { usePlayerStore } = await import("@/stores/player");
    const { useTrackStore } = await import("@/stores/tracks");
    const { useColumnWidthStore } = await import("@/stores/column-widths");
    const { usePreviewPanelStore } = await import("@/stores/preview-panel");
    const { audioEngine } = await import("@/lib/audio-engine");
    (window as unknown as { __beatos: Record<string, () => unknown> }).__beatos = {
      player: () => usePlayerStore.getState(),
      tracks: () => useTrackStore.getState(),
      widths: () => useColumnWidthStore.getState(),
      preview: () => usePreviewPanelStore.getState(),
      engine: () => ({
        status: audioEngine.getStatus(),
        duration: audioEngine.getDuration(),
        position: audioEngine.getCurrentPosition(),
        currentAssetId: audioEngine.getCurrentAssetId(),
        bpm: audioEngine.getBpm(),
      }),
    };
  })();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
