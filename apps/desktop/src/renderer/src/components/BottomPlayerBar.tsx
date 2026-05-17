import { useEffect, useMemo, useRef } from "react";
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
import { CoverImage } from "./CoverImage";
import { RoleSwitcher } from "./RoleSwitcher";
import { Slider } from "./ui/slider";
import { Button } from "./ui/button";
import { formatPlayerSubtitle, formatTime } from "@/lib/format-player";

export function BottomPlayerBar() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const currentAssetId = usePlayerStore((s) => s.currentAssetId);
  const status = usePlayerStore((s) => s.status);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);

  // Stable selector: select the whole list, derive current track with useMemo
  const trackList = useTrackStore((s) => s.list);
  const track = useMemo(
    () => (currentTrackId == null ? null : trackList.find((t) => t.id === currentTrackId) ?? null),
    [currentTrackId, trackList]
  );

  // Sync audio.src
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (currentAssetId == null) {
      a.removeAttribute("src");
      a.load();
      return;
    }
    a.src = `beatos-asset://audio/${currentAssetId}`;
    a.load();
    if (status === "playing") {
      a.play().catch((e) => {
        console.warn("[player] play failed", e);
        usePlayerStore.getState()._setStatus("error");
      });
    }
  }, [currentAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync play/pause state
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (status === "playing") {
      // If we're resuming after the track ended (queue end, repeat=off),
      // audio.ended is true and audio.currentTime is at duration. Chromium's
      // .play() on an ended element is unreliable — explicitly rewind first.
      if (a.ended) a.currentTime = 0;
      a.play().catch(() => {});
    } else if (status === "paused") {
      a.pause();
    }
  }, [status]);

  // Sync volume/mute
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = volume;
    a.muted = muted;
  }, [volume, muted]);

  // Sync store-initiated seeks (e.g. prev() restart) → audio.currentTime
  // Skip tiny deltas to avoid feedback with onTimeUpdate (which writes the
  // other direction). 0.5s threshold is comfortably above HTML5 timeupdate
  // granularity (~250ms).
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (Math.abs(a.currentTime - position) > 0.5) {
      a.currentTime = position;
    }
  }, [position]);

  // Keep the button clickable while in "error" — togglePlay's recovery branch
  // re-runs loadAndPlay so a user-tap can recover from a stuck load.
  const enabled = currentTrackId != null;
  const playing = status === "playing";
  const errored = status === "error";

  return (
    <footer
      data-bottom-player
      data-playing={playing ? "true" : "false"}
      className="flex h-[72px] shrink-0 items-center gap-4 border-t border-zinc-800 bg-zinc-950 px-4"
    >
      <audio
        ref={audioRef}
        onTimeUpdate={(e) =>
          usePlayerStore.getState()._setPosition(e.currentTarget.currentTime)
        }
        onLoadedMetadata={(e) =>
          usePlayerStore.getState()._setDuration(e.currentTarget.duration)
        }
        onError={(e) => {
          const err = e.currentTarget.error;
          const code = err?.code;
          const codeName =
            code === 1 ? "ABORTED" :
            code === 2 ? "NETWORK" :
            code === 3 ? "DECODE" :
            code === 4 ? "SRC_NOT_SUPPORTED" : "UNKNOWN";
          const src = e.currentTarget.currentSrc;
          console.warn(
            "[player] audio error code=", code, codeName,
            "message=", err?.message ?? "(none)",
            "src=", src
          );
          usePlayerStore.getState()._setStatus("error");
          useToastStore.getState().show(
            "error",
            `Playback failed (${codeName}). Click play to retry.`,
            6000
          );
        }}
        onStalled={() => {
          console.warn("[player] audio stalled");
        }}
        onEnded={(e) => {
          const s = usePlayerStore.getState();
          if (s.repeat === "one") {
            e.currentTarget.currentTime = 0;
          }
          s._onEnded();
        }}
      />

      {/* Left: cover + meta */}
      <div className="flex w-[28%] min-w-0 items-center gap-3">
        <CoverImage assetId={track?.cover_asset_id ?? null} size={40} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-100">
            {track?.title ?? "—"}
          </div>
          <div className="truncate text-xs text-zinc-400">
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
            onClick={() => usePlayerStore.getState().prev()}
            aria-label="Previous"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="default"
            disabled={!enabled}
            onClick={() => usePlayerStore.getState().togglePlay()}
            data-play-button
            data-status={status}
            aria-label={errored ? "Retry" : playing ? "Pause" : "Play"}
            title={errored ? "Playback failed — click to retry" : undefined}
            className={errored ? "ring-2 ring-red-500/60" : undefined}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={!enabled}
            onClick={() => usePlayerStore.getState().next()}
            aria-label="Next"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex w-full items-center gap-2">
          <span className="w-10 text-right text-[10px] tabular-nums text-zinc-500">
            {formatTime(position)}
          </span>
          <Slider
            min={0}
            max={duration || 1}
            step={0.1}
            value={[position]}
            disabled={!enabled}
            onValueChange={([v]) => {
              const a = audioRef.current;
              if (a) a.currentTime = v;
              // do NOT call _setPosition here — onTimeUpdate will sync it
            }}
            className="flex-1"
          />
          <span className="w-10 text-[10px] tabular-nums text-zinc-500">
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
          aria-label="Shuffle"
          data-active={shuffle ? "true" : "false"}
        >
          <Shuffle className={`h-4 w-4 ${shuffle ? "text-violet-400" : ""}`} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={!enabled}
          onClick={() => usePlayerStore.getState().cycleRepeat()}
          aria-label="Repeat"
          data-mode={repeat}
        >
          {repeat === "one" ? (
            <Repeat1 className="h-4 w-4 text-violet-400" />
          ) : (
            <Repeat className={`h-4 w-4 ${repeat === "all" ? "text-violet-400" : ""}`} />
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => usePlayerStore.getState().toggleMute()}
          aria-label={muted ? "Unmute" : "Mute"}
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
          aria-label="Volume"
        />
      </div>
    </footer>
  );
}
