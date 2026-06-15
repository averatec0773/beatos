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

/** True only under Electron on macOS, where the window uses
 *  `titleBarStyle: 'hiddenInset'` and the traffic lights overlay the renderer's
 *  top-left (src/main/index.ts) — so the top bar must inset its left edge to
 *  clear them. Windows Electron uses a native title bar *above* the renderer and
 *  the web build has no window controls, so neither needs that inset. */
const isMacOS =
  typeof navigator !== "undefined" &&
  /mac/i.test(
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      navigator.userAgent,
  );
export const isMacElectron = hasBridge && isMacOS;

export type { Platform, AssetKind } from "./types";
