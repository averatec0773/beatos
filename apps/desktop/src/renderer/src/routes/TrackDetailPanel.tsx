import React, { useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";

import { useTrackStore } from "@/stores/tracks";
import { useAssetStore } from "@/stores/assets";
import { CoverImage } from "@/components/CoverImage";
import { formatRowDate } from "@/lib/format-row-date";
import { PREVIEW_MAX_WIDTH, PREVIEW_MIN_WIDTH, usePreviewPanelStore } from "@/stores/preview-panel";
import { formatVocabLabel } from "@/data/vocab-label";
import { useVocabLocaleStore } from "@/stores/vocab-locale";
import { usePlayerStore } from "@/stores/player";

function PreviewResizer(): React.JSX.Element {
  const setWidth = usePreviewPanelStore((s) => s.setWidth);
  const startRef = useRef<{ startX: number; startWidth: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    startRef.current = {
      startX: e.clientX,
      startWidth: usePreviewPanelStore.getState().width,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const s = startRef.current;
    if (!s) return;
    // Drag LEFT = wider (panel grows from its left edge), so subtract delta.
    const next = s.startWidth - (e.clientX - s.startX);
    setWidth(Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, next)));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!startRef.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    startRef.current = null;
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize preview panel"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize hover:bg-accent/40 z-10"
      data-preview-resizer
    />
  );
}

function CloseButton(): React.JSX.Element {
  const setOpen = usePreviewPanelStore((s) => s.setOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(false)}
      className="absolute top-3 right-3 z-10 text-text-tertiary hover:text-text-primary p-1 hover:bg-bg-row-hover"
      aria-label="Close preview"
      data-preview-close
    >
      <X size={14} />
    </button>
  );
}

// Resting tilt of the record assembly (straight-on); the cursor turns it to
// face the pointer within ±TILT_RANGE degrees.
const VINYL_REST_RX = 0;
const VINYL_REST_RY = 0;
const VINYL_TILT_RANGE = 20;

function VinylStage({
  coverAsset,
  playing,
}: {
  coverAsset: { id: number } | null;
  playing: boolean;
}): React.JSX.Element {
  const innerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  function setTilt(rx: number, ry: number): void {
    const el = innerRef.current;
    if (el) el.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  // Turn the jacket+disc to face the cursor while it hovers the panel.
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const rx = VINYL_REST_RX - dy * VINYL_TILT_RANGE;
    const ry = VINYL_REST_RY + dx * VINYL_TILT_RANGE;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setTilt(rx, ry));
  }

  function onPointerLeave(): void {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setTilt(VINYL_REST_RX, VINYL_REST_RY);
  }

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      className="beatos-vinyl-scene group relative mx-auto h-[272px] w-[325px]"
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className="beatos-vinyl-shadow" />
      <div ref={innerRef} className="beatos-vinyl-inner">
        <div className={`beatos-disc-slide${playing ? " is-out" : ""}`}>
          <div
            data-vinyl-disc
            data-playing={playing ? "true" : undefined}
            className={`beatos-vinyl-disc relative h-full w-full${playing ? " beatos-vinyl-spinning" : ""}`}
          >
            <div className="absolute inset-[32%] overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.5)]">
              {coverAsset ? (
                <CoverImage assetId={coverAsset.id} size={80} responsive rounded={false} />
              ) : (
                <div className="h-full w-full bg-[var(--vinyl-label)]" />
              )}
            </div>
            <div className="absolute left-1/2 top-1/2 z-[2] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black shadow-[inset_0_0_2px_rgba(255,255,255,.25)]" />
          </div>
        </div>
        <div data-vinyl-jacket className="beatos-jacket-box">
          <div className="beatos-jacket-front overflow-hidden">
            <CoverImage assetId={coverAsset?.id ?? null} size={244} responsive rounded={false} />
          </div>
          <div className="beatos-jacket-side" />
          <div className="beatos-jacket-top" />
        </div>
      </div>
    </div>
  );
}

function LcdStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "violet";
}): React.JSX.Element {
  const has = value !== "—";
  const color = tone === "green" ? "var(--lcd-green)" : "var(--lcd-violet)";
  const glow = tone === "green" ? "var(--lcd-green-glow)" : "var(--lcd-violet-glow)";
  return (
    <div
      data-stat={label}
      className="flex-1 border border-border-subtle bg-[var(--lcd-bg)] px-3 py-2 shadow-[inset_0_1px_3px_#000]"
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
        {label}
      </div>
      <div
        className="mt-1.5 font-mono text-[19px] leading-none"
        style={
          has
            ? { color, textShadow: `0 0 6px ${glow}` }
            : { color: "var(--text-tertiary)" }
        }
      >
        {value}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <span
      data-chip
      className="border border-border-subtle bg-bg-elevated-hover px-2 py-1 font-mono text-[11px] text-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"
    >
      {children}
    </span>
  );
}

function EtchDivider(): React.JSX.Element {
  return (
    <div className="my-4 h-px beatos-etch-divider" />
  );
}

export function TrackDetailPanel(): React.JSX.Element | null {
  const open = usePreviewPanelStore((s) => s.open);
  const width = usePreviewPanelStore((s) => s.width);
  const current = useTrackStore((s) => s.current);
  const byTrack = useAssetStore((s) => s.byTrack);
  const vocabLocale = useVocabLocaleStore((s) => s.locale);
  const playerTrackId = usePlayerStore((s) => s.currentTrackId);
  const playerStatus = usePlayerStore((s) => s.status);
  const playingThis = current != null && playerTrackId === current.id && playerStatus === "playing";

  // Selecting a track while the panel is closed shouldn't silently open it —
  // user explicitly closed it. They re-open via the TopBar toggle.
  // (Spotify behavior; less surprising than auto-reopen.)

  const coverAsset = useMemo(() => {
    if (!current) return null;
    const list = byTrack[current.id];
    if (!list) return null;
    return list.find((a) => a.role === "cover") ?? null;
  }, [byTrack, current]);

  useEffect(() => {
    // No-op; keeps lint happy when the panel is mounted-but-hidden mode is
    // considered in the future.
  }, []);

  if (!open) return null;

  if (!current) {
    return (
      <aside
        className="relative beatos-scroll bg-bg-elevated border-l border-border-subtle p-4 flex-shrink-0"
        style={{ width }}
      >
        <PreviewResizer />
        <CloseButton />
        <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
          Now Focused
        </div>
        <div className="mt-2 text-text-tertiary text-sm">Select a track to see details.</div>
      </aside>
    );
  }

  return (
    <aside
      className="relative beatos-scroll bg-bg-elevated border-l border-border-subtle p-4 flex flex-col gap-4 overflow-y-auto flex-shrink-0"
      style={{ width }}
    >
      <PreviewResizer />
      <CloseButton />
      <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
        {playingThis ? "Now Playing" : "Now Focused"}
      </div>
      <div
        draggable={coverAsset != null && !coverAsset.missing}
        onDragStart={(e) => {
          if (!coverAsset || coverAsset.missing) return;
          e.preventDefault();
          window.beatos.startDragFile(coverAsset.abs_path);
        }}
        data-cover-drag-source
        className="w-full"
      >
        <VinylStage coverAsset={coverAsset ? { id: coverAsset.id } : null} playing={playingThis} />
      </div>
      <div>
        <div className="text-2xl font-bold leading-tight">{current.title}</div>
        <div className="text-text-secondary text-sm mt-1">
          {current.genre && current.genre.length > 0 ? (
            current.genre.map((g) => formatVocabLabel(g, "genre", vocabLocale)).join(", ")
          ) : (
            <span className="text-text-tertiary">No genre</span>
          )}
        </div>
      </div>
      <div className="flex gap-2.5">
        <LcdStat label="BPM" value={current.bpm != null ? String(current.bpm) : "—"} tone="green" />
        <LcdStat label="Key" value={current.key_signature ?? "—"} tone="violet" />
      </div>

      <div>
        <EtchDivider />
        <div className="mb-3 text-[9px] uppercase tracking-[0.13em] font-semibold text-text-tertiary">
          Genre / Mood
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(current.genre ?? []).map((g) => (
            <Chip key={`g-${g}`}>{formatVocabLabel(g, "genre", vocabLocale)}</Chip>
          ))}
          {(current.mood ?? []).map((m) => (
            <Chip key={`m-${m}`}>{formatVocabLabel(m, "mood", vocabLocale)}</Chip>
          ))}
          {(current.genre == null || current.genre.length === 0) &&
            (current.mood == null || current.mood.length === 0) && (
              <span className="text-sm text-text-tertiary">—</span>
            )}
        </div>
      </div>

      <div>
        <EtchDivider />
        <div className="mb-3 text-[9px] uppercase tracking-[0.13em] font-semibold text-text-tertiary">
          Credits
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">Producer</span>
            <span className="text-text-primary">
              {current.producer && current.producer.length > 0 ? current.producer.join(", ") : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">Added</span>
            <span className="font-mono text-text-secondary">{formatRowDate(current.created_at)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-tertiary">Updated</span>
            <span className="font-mono text-text-secondary">{formatRowDate(current.updated_at)}</span>
          </div>
          {current.tags && current.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {current.tags.map((t) => (
                <Chip key={`t-${t}`}>{t}</Chip>
              ))}
            </div>
          )}
        </div>
      </div>

      {current.description && current.description.trim().length > 0 && (
        <div>
          <EtchDivider />
          <div className="mb-2 text-[9px] uppercase tracking-[0.13em] font-semibold text-text-tertiary">
            Description
          </div>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
            {current.description}
          </div>
        </div>
      )}
    </aside>
  );
}
