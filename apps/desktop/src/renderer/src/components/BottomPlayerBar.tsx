import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
} from "lucide-react";

import { usePlayerStore } from "@/stores/player";
import { useTrackStore } from "@/stores/tracks";
import { useToastStore } from "@/stores/toast";
import { audioEngine } from "@/lib/audio-engine";
import { platform } from "@/platform";
import { CoverImage } from "./CoverImage";
import { RoleSwitcher } from "./RoleSwitcher";
import { Slider } from "./ui/slider";
import { AsciiSeekWaveform } from "./AsciiSeekWaveform";
import { Button } from "./ui/button";
import { formatPlayerSubtitle, formatTime } from "@/lib/format-player";

export function BottomPlayerBar() {
  const { t } = useTranslation();
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const status = usePlayerStore((s) => s.status);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);

  // Stable selector: select the whole list, derive current track with useMemo.
  // Falls back to `useTrackStore.current` (the right-panel selection) when the
  // player hasn't loaded anything yet, so clicking a row immediately populates
  // the bottom bar (cover + title + producer) and enables the play button.
  const trackList = useTrackStore((s) => s.list);
  const selectedTrack = useTrackStore((s) => s.current);
  const track = useMemo(() => {
    if (currentTrackId == null) return selectedTrack;
    return trackList.find((item) => item.id === currentTrackId) ?? null;
  }, [currentTrackId, trackList, selectedTrack]);

  // UI-level engine bridge: initial volume / forceMuted + decode-error toast.
  // The status/position/duration/ended subscription lives in player.ts so
  // tests can mock the engine without mounting this component.
  useEffect(() => {
    const force = platform.isAudioForceMuted();
    audioEngine.setForceMuted(force);
    audioEngine.setVolume(usePlayerStore.getState().volume);
    audioEngine.setMuted(usePlayerStore.getState().muted);
    return audioEngine.on("error", (err) => {
      console.warn("[player] decode error", err);
      useToastStore.getState().show("error", t("player.decodeFailedToast"), 6000);
    });
  }, []);

  const enabled = track != null;
  const playing = status === "playing";
  const errored = status === "error";

  function getVisibleIds(): number[] {
    return useTrackStore.getState().list.map((item) => item.id);
  }

  function handleTogglePlay(): void {
    const s = usePlayerStore.getState();
    // Prefer the user's current row selection in any case where the player
    // is not actively running on a known-good track. Covers first-play,
    // recovery from a failed track, and idle state.
    if (
      selectedTrack &&
      (s.currentTrackId == null || s.status === "error" || s.status === "idle")
    ) {
      const ids = getVisibleIds();
      const startIndex = ids.indexOf(selectedTrack.id);
      if (startIndex < 0) return;
      void s.playFromQueue({ trackIds: ids, startIndex, origin: { kind: "all" } });
      return;
    }
    s.togglePlay();
  }

  // Rebuild the queue from the CURRENT visible tracks before delegating to
  // the store's next/prev. Two reasons:
  //   1. Without this, next/prev step through the queue that was set at the
  //      first playFromQueue (possibly stale if the user has since changed
  //      the search filter or list route).
  //   2. A single-track queue (one row visible at play time) ends after one
  //      `next()` and the engine pauses — re-anchoring to the live visible
  //      list lets the user keep clicking next as long as there's somewhere
  //      to go.
  // Shuffle mode is PRESERVED — store.syncQueue regenerates the shuffle
  // order against the new ids without flipping the shuffle flag off.
  function syncQueueFromVisible(): void {
    const s = usePlayerStore.getState();
    const ids = getVisibleIds();
    if (ids.length === 0) return;
    s.syncQueue(ids, s.currentTrackId);
  }

  function handlePrev(): void {
    syncQueueFromVisible();
    void usePlayerStore.getState().prev({ wrap: true });
  }

  function handleNext(): void {
    syncQueueFromVisible();
    void usePlayerStore.getState().next({ wrap: true });
  }

  return (
    <footer
      data-bottom-player
      data-playing={playing ? "true" : "false"}
      className="glass relative z-10 flex h-[72px] shrink-0 items-center gap-4 border-t border-border-subtle px-4"
    >
      {/* Left: cover + meta */}
      <div className="flex w-[28%] min-w-0 items-center gap-3">
        <CoverImage assetId={track?.cover_asset_id ?? null} size={40} />
        <div className="min-w-0">
          <div data-player-title className="truncate text-sm font-medium text-text-primary">
            {track?.title ?? "—"}
          </div>
          <div className="truncate text-xs text-text-secondary">
            {formatPlayerSubtitle({
              producer: track?.producer ?? null,
              bpm: track?.bpm ?? null,
              key: track?.key_signature ?? null,
            })}
          </div>
        </div>
      </div>

      {/* Center: transport + seek */}
      <div className="flex flex-1 flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            disabled={!enabled}
            onClick={handlePrev}
            aria-label={t("player.previous")}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="default"
            disabled={!enabled}
            onClick={handleTogglePlay}
            data-play-button
            data-status={status}
            aria-label={
              errored ? t("player.retry") : playing ? t("player.pause") : t("player.play")
            }
            title={errored ? t("player.retryTitle") : undefined}
            className={errored ? "ring-2 ring-red-500/60" : undefined}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={!enabled}
            onClick={handleNext}
            aria-label={t("player.next")}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex w-full items-center gap-2">
          <span className="w-10 text-right text-[10px] tabular-nums text-text-tertiary">
            {formatTime(position)}
          </span>
          <AsciiSeekWaveform
            min={0}
            max={duration || 1}
            step={0.1}
            value={[position]}
            disabled={!enabled}
            onValueChange={([v]) => usePlayerStore.getState().seek(v)}
            className="flex-1"
          />
          <span className="w-10 text-[10px] tabular-nums text-text-tertiary">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Right: role switcher + shuffle/repeat + volume */}
      <div className="flex w-[28%] items-center justify-end gap-2">
        <RoleSwitcher />
        <Button
          size="icon"
          variant="ghost"
          disabled={!enabled}
          onClick={() => usePlayerStore.getState().toggleShuffle()}
          aria-label={t("player.shuffle")}
          data-active={shuffle ? "true" : "false"}
        >
          <Shuffle className={`h-4 w-4 ${shuffle ? "text-accent" : ""}`} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={!enabled}
          onClick={() => usePlayerStore.getState().cycleRepeat()}
          aria-label={t("player.repeat")}
          data-mode={repeat}
        >
          {repeat === "one" ? (
            <Repeat1 className="h-4 w-4 text-accent" />
          ) : (
            <Repeat className={`h-4 w-4 ${repeat === "all" ? "text-accent" : ""}`} />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => usePlayerStore.getState().toggleMute()}
          aria-label={muted ? t("player.unmute") : t("player.mute")}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[muted ? 0 : volume]}
          onValueChange={([v]) => usePlayerStore.getState().setVolume(v)}
          className="w-24"
          aria-label={t("player.volume")}
        />
      </div>
    </footer>
  );
}
