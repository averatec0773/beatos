import React, { useEffect, useRef } from "react";

// Both assets are bundled INTO the app JS (not served as separate files): the
// runtime as a raw string (`?raw`), the scene as a parsed object. We hand them
// to the runtime as same-origin Blob URLs. This is the one approach that works
// in all three host modes — Vite dev (http), packaged Electron (file://, where
// fetch() of sibling files is blocked), and the web SPA (http) — with zero
// network calls (local-first; see CLAUDE.md rule 16). It needs `blob:` in the
// renderer CSP `script-src`/`connect-src` (see index.html).
//
// Why not `?url` / a `<script src>` to a real file: Vite rewrites bare `.js`
// asset URLs into ESM in dev (breaks a classic <script>), and the runtime would
// `fetch()` the scene over file:// in packaged Electron (blocked). `?raw`
// dodges both — and also avoids Vite trying to analyze the runtime's internal
// dynamic import() of its (unused) 3D extensions.
import sdkSource from "@/assets/backdrops/unicornStudio.umd.js?raw";
import sceneData from "@/assets/backdrops/frosty-aurora.json";

/**
 * Ambient "aurora" backdrop — a Unicorn Studio WebGL gradient/noise field
 * (violet `#7001d7`) painted behind the floating column cards (z-0), the GPU
 * sibling of {@link AsciiBackdrop}. The translucent `.beatos-card` surfaces let
 * it read as soft moving light through their blur (CLAUDE.md rule 13).
 *
 * Guards mirror the rest of the app:
 *   - `prefers-reduced-motion` → skip the animated scene entirely (dark base).
 *   - the engine drives its own rAF, which the browser/Electron throttle while
 *     the window is hidden, so an idle window doesn't burn the GPU.
 */

interface UnicornScene {
  destroy(): void;
}

interface UnicornStudioGlobal {
  addScene(opts: {
    element: HTMLElement;
    filePath: string;
    dpi?: number;
    scale?: number;
    fps?: number;
    production?: boolean;
    lazyLoad?: boolean;
  }): Promise<UnicornScene>;
  destroy(): void;
}

declare global {
  interface Window {
    UnicornStudio?: UnicornStudioGlobal;
  }
}

// Inject the bundled runtime once per app lifetime via a same-origin Blob URL
// (module-scoped promise dedupes across remounts). Resolves with the ready
// global.
let sdkPromise: Promise<UnicornStudioGlobal> | null = null;
function loadUnicornSdk(): Promise<UnicornStudioGlobal> {
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

export function UnicornBackdrop(): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (reduced) return; // honour reduced-motion — leave the dark app base

    let scene: UnicornScene | null = null;
    let cancelled = false;

    void loadUnicornSdk()
      .then((us) => {
        if (cancelled || !ref.current) return null;
        // The runtime only takes a fetchable `filePath`; hand it the bundled
        // scene as a same-origin Blob URL (revoked once it has been fetched).
        const sceneUrl = URL.createObjectURL(
          new Blob([JSON.stringify(sceneData)], { type: "application/json" }),
        );
        return us
          .addScene({
            element: el,
            filePath: sceneUrl,
            // Always-on full-window backdrop → render lighter than the export's
            // dpi 1.5 / scale 1 defaults to keep the GPU cost modest. It sits
            // behind blurred cards, so the softer resolution is invisible.
            dpi: 1,
            scale: 1,
            fps: 60,
            production: true,
            lazyLoad: false,
          })
          .finally(() => URL.revokeObjectURL(sceneUrl));
      })
      .then((s) => {
        if (!s) return;
        if (cancelled) s.destroy();
        else scene = s;
      })
      .catch(() => {
        /* runtime or scene failed to load — silently leave the dark base */
      });

    return () => {
      cancelled = true;
      scene?.destroy();
      scene = null;
    };
  }, []);

  return (
    <div
      ref={ref}
      data-unicorn-backdrop
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
    />
  );
}
