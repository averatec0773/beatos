import { useEffect, useState } from "react";

/**
 * Extracts a representative "glow" colour from a cover image, returned as an
 * `"r, g, b"` channel string for composing into `rgba(...)`, or `null` when
 * there is no cover / extraction is unavailable.
 *
 * The cover loads over the `beatos-asset://` scheme, which is registered
 * `corsEnabled` (see main/index.ts), so an `<img crossOrigin="anonymous">`
 * draws to a canvas without tainting it. If readback still throws (tainted
 * canvas, decode failure), we fall back to `null` and callers use a neutral
 * white glow.
 *
 * The average is weighted by per-pixel saturation so the glow picks the cover's
 * vivid hue rather than a muddy grey mean.
 */
export function useDominantColor(assetId: number | null): string | null {
  const [channels, setChannels] = useState<string | null>(null);

  useEffect(() => {
    if (assetId == null) {
      setChannels(null);
      return;
    }
    let cancelled = false;
    // Debounce: while the user rapidly switches tracks, don't fire a cover
    // request per switch (that storm starves the visible <img> loads). Only
    // extract once focus settles for ~150ms.
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => {
      img.src = `beatos-asset://cover/${assetId}`;
    }, 150);
    img.onload = () => {
      if (cancelled) return;
      try {
        const N = 16;
        const canvas = document.createElement("canvas");
        canvas.width = N;
        canvas.height = N;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, N, N);
        const { data } = ctx.getImageData(0, 0, N, N);
        let r = 0;
        let g = 0;
        let b = 0;
        let wsum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const rr = data[i];
          const gg = data[i + 1];
          const bb = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;
          const sat = Math.max(rr, gg, bb) - Math.min(rr, gg, bb);
          const w = 1 + sat / 48;
          r += rr * w;
          g += gg * w;
          b += bb * w;
          wsum += w;
        }
        if (wsum === 0 || cancelled) return;
        setChannels(
          `${Math.round(r / wsum)}, ${Math.round(g / wsum)}, ${Math.round(b / wsum)}`,
        );
      } catch {
        if (!cancelled) setChannels(null);
      }
    };
    img.onerror = () => {
      if (!cancelled) setChannels(null);
    };
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      img.src = "";
    };
  }, [assetId]);

  return channels;
}
