import type { BeatosAPI } from "../../../preload";

export type AssetKind = "audio" | "cover";

/**
 * The capability seam between the renderer and its host. `electron` delegates
 * to the preload `window.beatos`; `web` uses same-origin HTTP + browser APIs.
 * Extends `BeatosAPI` so the Electron implementation is a thin pass-through,
 * plus `assetUrl` which abstracts the beatos-asset:// vs /api/assets/ split.
 */
export interface Platform extends BeatosAPI {
  /** "electron" | "web" — for the rare branch that genuinely must differ. */
  readonly kind: "electron" | "web";
  /** URL for an audio/cover asset, resolved per host. */
  assetUrl(kind: AssetKind, assetId: number): string;
}
