import React, { useMemo } from "react";
import { PanelRightClose } from "lucide-react";

import { useTrackStore } from "@/stores/tracks";
import { useAssetStore } from "@/stores/assets";
import { formatRowDate } from "@/lib/format-row-date";
import { PREVIEW_MAX_WIDTH, PREVIEW_MIN_WIDTH, usePreviewPanelStore } from "@/stores/preview-panel";
import { formatVocabLabel } from "@/data/vocab-label";
import { useVocabLocaleStore } from "@/stores/vocab-locale";
import { usePlayerStore } from "@/stores/player";
import { Coverflow } from "@/components/Coverflow";
import { useDominantColor } from "@/lib/use-dominant-color";
import { GutterResizer } from "@/components/GutterResizer";

/**
 * Resize handle for the preview panel, rendered in the gutter BETWEEN the list
 * card and the detail card (not clipped inside either). Hidden when the panel
 * is closed. Drag LEFT = wider (the panel grows from its left edge → w - dx).
 */
export function PreviewGutter(): React.JSX.Element | null {
  const open = usePreviewPanelStore((s) => s.open);
  const setWidth = usePreviewPanelStore((s) => s.setWidth);
  if (!open) return null;
  return (
    <GutterResizer
      ariaLabel="Resize preview panel"
      dataAttr="data-preview-resizer"
      getStartWidth={() => usePreviewPanelStore.getState().width}
      onResize={(w, dx) =>
        setWidth(Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, w - dx)))
      }
    />
  );
}

/**
 * Detail-panel header — mirrors the sidebar's: the label on the left, the
 * collapse toggle on the RIGHT (replacing the old × close button). Reopen is
 * via the TopBar preview toggle.
 */
function DetailHeader({ label }: { label: string }): React.JSX.Element {
  const setOpen = usePreviewPanelStore((s) => s.setOpen);
  return (
    <div className="flex items-center justify-between">
      <div className="beatos-eyebrow">{label}</div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-text-tertiary hover:text-text-primary p-1 -mr-1 rounded-md hover:bg-bg-row-hover"
        aria-label="Hide preview"
        title="Hide preview"
        data-preview-close
      >
        <PanelRightClose size={16} />
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  glow,
}: {
  label: string;
  value: string;
  glow?: string | null;
}): React.JSX.Element {
  const has = value !== "—";
  // Half the previous brightness (.25 -> .12), tinted by the cover's colour.
  const tint = glow ?? "255, 255, 255";
  return (
    <div data-stat={label} className="flex-1">
      <div className="beatos-eyebrow">{label}</div>
      <div
        className="mt-2 font-mono text-[22px] leading-none"
        style={
          has
            ? { color: "var(--text-primary)", textShadow: `0 0 8px rgba(${tint}, .12)` }
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

  const glow = useDominantColor(current?.cover_asset_id ?? null);

  if (!open) return null;

  if (!current) {
    return (
      <aside
        className="relative beatos-scroll overflow-y-auto bg-bg-elevated rounded-xl p-4 flex-shrink-0"
        style={{ width }}
      >
        <DetailHeader label="Now Focused" />
        <div className="mt-2 text-text-tertiary text-sm">Select a track to see details.</div>
      </aside>
    );
  }

  return (
    <aside
      className="relative beatos-scroll bg-bg-elevated rounded-xl p-4 flex flex-col gap-4 overflow-y-auto flex-shrink-0"
      style={{ width }}
    >
      <DetailHeader label={playingThis ? "Now Playing" : "Now Focused"} />
      <Coverflow
        panelWidth={width}
        glowColor={glow}
        centerDraggable={coverAsset != null && !coverAsset.missing}
        onCenterDragStart={(e) => {
          if (!coverAsset || coverAsset.missing) return;
          e.preventDefault();
          window.beatos.startDragFile(coverAsset.abs_path);
        }}
      />
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
        <Stat label="BPM" value={current.bpm != null ? String(current.bpm) : "—"} glow={glow} />
        <Stat label="Key" value={current.key_signature ?? "—"} glow={glow} />
      </div>

      <div>
        <EtchDivider />
        <div className="beatos-eyebrow mb-3">
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
        <div className="beatos-eyebrow mb-3">
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
          <div className="beatos-eyebrow mb-2">
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
