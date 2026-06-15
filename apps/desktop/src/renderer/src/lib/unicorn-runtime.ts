// Shared loader for the vendored Unicorn Studio WebGL runtime, used by both the
// aurora backdrop (`UnicornBackdrop`) and the search-box orb (`SearchOrb`).
//
// The runtime is bundled INTO the app JS as a raw string (`?raw`) and injected
// via a same-origin Blob `<script>`; scenes are handed over as Blob URLs too.
// This is the one approach that works in all three host modes — Vite dev (http),
// packaged Electron (file://, where fetch() of sibling files is blocked), and
// the web SPA (http) — with zero network calls (local-first; CLAUDE.md rule 17).
// It needs `blob:` in the renderer CSP `script-src`/`connect-src` (index.html).
//
// Why not `?url` + `<script src>`: Vite rewrites bare `.js` asset URLs into ESM
// in dev (breaks a classic <script>), and the runtime would fetch() the scene
// over file:// in packaged Electron (blocked). `?raw` dodges both, and also
// avoids Vite analyzing the runtime's internal dynamic import() of its (unused)
// 3D extensions.
import sdkSource from "@/assets/backdrops/unicornStudio.umd.js?raw";

export interface UnicornScene {
  destroy(): void;
}

export interface UnicornSceneOpts {
  element: HTMLElement;
  filePath: string;
  dpi?: number;
  scale?: number;
  fps?: number;
  production?: boolean;
  lazyLoad?: boolean;
}

export interface UnicornStudioGlobal {
  addScene(opts: UnicornSceneOpts): Promise<UnicornScene>;
  destroy(): void;
}

declare global {
  interface Window {
    UnicornStudio?: UnicornStudioGlobal;
  }
}

// Inject the bundled runtime once per app lifetime (module-scoped promise
// dedupes across components + remounts). Resolves with the ready global.
let sdkPromise: Promise<UnicornStudioGlobal> | null = null;
export function loadUnicornSdk(): Promise<UnicornStudioGlobal> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("no DOM"));
  }
  if (window.UnicornStudio?.addScene) return Promise.resolve(window.UnicornStudio);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(new Blob([sdkSource], { type: "text/javascript" }));
    const script = document.createElement("script");
    script.src = blobUrl;
    script.async = true;
    script.dataset.unicornSdk = "true";
    script.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(blobUrl);
        if (window.UnicornStudio?.addScene) resolve(window.UnicornStudio);
        else reject(new Error("UnicornStudio runtime loaded but global missing"));
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(blobUrl);
        sdkPromise = null; // allow a later remount to retry
        reject(new Error("failed to load Unicorn runtime"));
      },
      { once: true },
    );
    document.head.appendChild(script);
  });
  return sdkPromise;
}

// True when the environment can actually run a WebGL scene. jsdom (tests) and
// GPU-less hosts return false so callers can fall back to a static element.
export function hasWebgl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// Mount a bundled scene object into `element`, handing it over as a same-origin
// Blob URL (revoked once the runtime has fetched it). Resolves with the scene
// (call `.destroy()` to tear down), or `null` if `isCancelled()` flipped true
// while the runtime was still loading — React StrictMode mounts effects twice in
// dev, and firing two concurrent `addScene` calls at the same element makes the
// runtime operate on a torn-down plane (null-canvas errors). The cancel check
// skips the doomed first mount so only one `addScene` ever runs per element.
export async function mountScene(
  element: HTMLElement,
  sceneData: unknown,
  opts: Omit<UnicornSceneOpts, "element" | "filePath"> = {},
  isCancelled?: () => boolean,
): Promise<UnicornScene | null> {
  const us = await loadUnicornSdk();
  if (isCancelled?.()) return null;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(sceneData)], { type: "application/json" }),
  );
  try {
    return await us.addScene({
      element,
      filePath: url,
      production: true,
      lazyLoad: false,
      ...opts,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
