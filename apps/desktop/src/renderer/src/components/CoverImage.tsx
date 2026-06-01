import React, { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

interface Props {
  assetId: number | null;
  size: number;
  /** Fill parent width and stay square. Overrides `size` for layout. */
  responsive?: boolean;
  className?: string;
  /** Apply 4px corner radius. Set false for square jacket / circular label clip. */
  rounded?: boolean;
}

/**
 * Renders a cover image via the beatos-asset:// custom protocol.
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
  const [errored, setErrored] = useState(false);

  const wrapperStyle: React.CSSProperties | undefined = responsive
    ? undefined
    : { width: size, height: size };
  const wrapperClass = `relative ${responsive ? "w-full " : ""}aspect-square overflow-hidden ${rounded ? "rounded" : ""} ${className}`;

  if (assetId == null || errored) {
    return (
      <div
        style={wrapperStyle}
        className={`${wrapperClass} flex items-center justify-center bg-bg-elevated-hover text-text-tertiary`}
        aria-label="No cover"
      >
        <ImageIcon size={Math.max(12, size / 3)} />
      </div>
    );
  }

  return (
    <div style={wrapperStyle} className={wrapperClass}>
      <img
        src={`beatos-asset://cover/${assetId}`}
        onError={() => setErrored(true)}
        className="w-full h-full object-cover"
        alt=""
      />
    </div>
  );
}
