import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Expose store snapshots on window for ad-hoc dev debugging from DevTools.
// `window.__beatos.player()` / `window.__beatos.tracks()` etc. return the
// current state object. Lazy require avoids circular deps.
if (typeof window !== "undefined") {
  void (async () => {
    const { usePlayerStore } = await import("@/stores/player");
    const { useTrackStore } = await import("@/stores/tracks");
    const { useColumnWidthStore } = await import("@/stores/column-widths");
    const { usePreviewPanelStore } = await import("@/stores/preview-panel");
    (window as unknown as { __beatos: Record<string, () => unknown> }).__beatos = {
      player: () => usePlayerStore.getState(),
      tracks: () => useTrackStore.getState(),
      widths: () => useColumnWidthStore.getState(),
      preview: () => usePreviewPanelStore.getState(),
    };
  })();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
