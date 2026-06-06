import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { platform } from "@/platform";

interface Props {
  assetId: number | null;
  size: number;
  /** Fill parent width and stay square. Overrides `size` for layout. */
  responsive?: boolean;
  className?: string;
  /** Apply 4px corner radius. Set false for square (un-rounded) covers, e.g. the coverflow hero. */
  rounded?: boolean;
}

/**
 * Renders a cover image via the platform asset URL.
 * Falls back to a music-note placeholder on error or null asset.
 *
 * Always renders in a square box: a non-square source image is cropped via
 * `object-cover` rather than displayed at its original aspect ratio. The
 * wrapper carries `aspect-square` so even fluid (`responsive`) callers stay
 * square — without this, `<img>` under `width: 100%` lets the browser pick
 * height from the natural aspect ratio.
 */
export function CoverImage({
  assetId,
  size,
  responsive = false,
  className = "",
  rounded = true,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [errored, setErrored] = useState(false);
  // Retry transient load failures (e.g. an aborted protocol fetch during rapid
  // track switching) instead of sticking on the placeholder forever. Reset on
  // assetId change so a reused instance always re-attempts the new cover.
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<number | null>(null);
  useEffect(() => {
    setErrored(false);
    setAttempt(0);
    // Cancel a pending retry from the previous cover so it can't fire
    // setAttempt after unmount or bump the new cover's retry count.
    return () => {
      if (retryTimer.current != null) window.clearTimeout(retryTimer.current);
    };
  }, [assetId]);

  const wrapperStyle: React.CSSProperties | undefined = responsive
    ? undefined
    : { width: size, height: size };
  const wrapperClass = `relative ${responsive ? "w-full " : ""}aspect-square overflow-hidden ${rounded ? "rounded" : ""} ${className}`;

  if (assetId == null || errored) {
    return (
      <div
        style={wrapperStyle}
        className={`${wrapperClass} flex items-center justify-center bg-bg-elevated-hover text-text-tertiary`}
        aria-label={t("common.noCover")}
      >
        <ImageIcon size={Math.max(12, size / 3)} />
      </div>
    );
  }

  return (
    <div style={wrapperStyle} className={wrapperClass}>
      <img
        key={attempt}
        src={platform.assetUrl("cover", assetId)}
        onError={() => {
          if (attempt < 2) {
            retryTimer.current = window.setTimeout(() => setAttempt((a) => a + 1), 250);
          } else {
            setErrored(true);
          }
        }}
        className="w-full h-full object-cover"
        alt=""
      />
    </div>
  );
}
