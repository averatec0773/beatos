import type { ColumnKey } from "@/stores/column-widths";

/**
 * The library table column tracks, shared between `<TableHeader>` and every
 * `<TrackRow>`. Both render as CSS Grid with this exact template, which is
 * the ONLY way to guarantee column-perfect alignment across rows whose
 * content height / character set differs (e.g. a row with multi-line
 * producer subtitle vs a row without). Flex-with-spacer layouts drift
 * because intrinsic content size leaks into cell width unless every cell is
 * `width: <px>`, which we explicitly DON'T want for the auto-sized title /
 * updated columns.
 *
 * Column order: cover (48 px), title (auto or pinned), bpm (pinned), key
 * (pinned), genre (pinned), updated (flex, min 80 px). No resizer tracks —
 * `<ColumnResizer>` overlays the right edge of each header cell via
 * `position: absolute` instead of consuming its own grid track.
 */
export function getGridTemplateColumns(widths: Record<ColumnKey, number>): string {
  const title = widths.title === 0 ? "1fr" : `${widths.title}px`;
  return `48px ${title} ${widths.bpm}px ${widths.key}px ${widths.genre}px minmax(${widths.updated}px, 1fr)`;
}

/** Horizontal gap between grid tracks. Used in both header and row. */
export const TABLE_COL_GAP = "12px";
/** Left/right padding inside the grid container. */
export const TABLE_COL_PADDING_X = "1rem"; // matches Tailwind px-4
