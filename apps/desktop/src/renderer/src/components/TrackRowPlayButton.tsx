import { Play, Pause } from "lucide-react";

import { Button } from "./ui/button";
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

  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7"
      disabled={!hasAudio}
      title={hasAudio ? (playing ? "Pause" : "Play") : "No audio asset"}
      onClick={onClick}
      data-has-audio={hasAudio ? "true" : "false"}
      data-row-play-button
      aria-label={hasAudio ? (playing ? "Pause" : "Play") : "No audio asset"}
    >
      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
    </Button>
  );
}
