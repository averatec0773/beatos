import { Play, Pause } from "lucide-react";

import { usePlayerStore } from "@/stores/player";
import { useTrackStore } from "@/stores/tracks";
import { useSourceStore } from "@/stores/sources";

export function TrackRowPlayButton({
  trackId,
  hasAudio,
}: {
  trackId: number;
  hasAudio: boolean;
}) {
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const status = usePlayerStore((s) => s.status);
  const isCurrent = currentTrackId === trackId;
  const playing = isCurrent && status === "playing";

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrent) {
      usePlayerStore.getState().togglePlay();
      return;
    }
    const list = useTrackStore.getState().list;
    const ids = list.map((t) => t.id);
    const startIndex = ids.indexOf(trackId);
    const activeFilter = useSourceStore.getState().activeFilter;
    const source =
      activeFilter == null
        ? { kind: "all" as const }
        : { kind: "source" as const, id: activeFilter };
    usePlayerStore.getState().playFromQueue({ trackIds: ids, startIndex, source });
  };

  // Overlay-style: shown by row hover (parent toggles opacity) or when this
  // row is the currently-playing track. Visual is a centered round button on
  // a dark scrim above the cover thumbnail.
  return (
    <button
      type="button"
      disabled={!hasAudio}
      title={hasAudio ? (playing ? "Pause" : "Play") : "No audio asset"}
      onClick={onClick}
      data-has-audio={hasAudio ? "true" : "false"}
      data-row-play-button
      aria-label={hasAudio ? (playing ? "Pause" : "Play") : "No audio asset"}
      className={`absolute inset-0 flex items-center justify-center rounded-md
        transition-opacity
        ${playing ? "opacity-100" : "opacity-0 group-hover:opacity-100"}
        ${hasAudio ? "bg-black/55 hover:bg-black/70 text-white cursor-pointer" : "bg-black/40 text-white/60 cursor-not-allowed"}
      `}
    >
      {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
    </button>
  );
}
