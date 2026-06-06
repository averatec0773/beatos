import type { Platform } from "./types";
import { electronPlatform } from "./electron";
import { webPlatform } from "./web";

/** Electron injects `window.beatos` via the preload bridge; the web build has
 *  no preload, so its absence selects the browser implementation.
 *  NOTE: evaluated once at module load (ES-module singleton). Tests that need to
 *  exercise a specific impl should import `electronPlatform` / `webPlatform`
 *  directly rather than toggling `window.beatos` and re-importing this module. */
const hasBridge =
  typeof window !== "undefined" && (window as unknown as { beatos?: unknown }).beatos != null;

export const platform: Platform = hasBridge ? electronPlatform : webPlatform;

export type { Platform, AssetKind } from "./types";
