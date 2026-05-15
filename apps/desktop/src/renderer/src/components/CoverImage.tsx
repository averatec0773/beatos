import React, { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

interface Props {
  assetId: number | null;
  size: number;
  className?: string;
}

/**
 * Renders a cover image via the beatos-asset:// custom protocol.
 * Falls back to a music-note placeholder on error or null asset.
 */
export function CoverImage({ assetId, size, className = "" }: Props): React.JSX.Element {
  const [errored, setErrored] = useState(false);

  if (assetId == null || errored) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-bg-elevated-hover text-text-tertiary rounded ${className}`}
        aria-label="No cover"
      >
        <ImageIcon size={Math.max(12, size / 3)} />
      </div>
    );
  }

  return (
    <img
      src={`beatos-asset://cover/${assetId}`}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className={`object-cover rounded ${className}`}
      alt=""
    />
  );
}
