import type { Track, TrackUpdate } from "@/api/tracks";

export const AUTOSAVE_DEBOUNCE_MS = 800;

export type SaveState = "idle" | "saving" | "saved" | "error";

export function buildPayload(t: Track): TrackUpdate {
  return {
    title: t.title,
    bpm: t.bpm,
    key_signature: t.key_signature,
    genre: t.genre,
    mood: t.mood,
    tags: t.tags,
    description: t.description,
    producer: t.producer,
  };
}

/**
 * True when a freshly-created "Untitled" row was never given any content — no
 * real title, no audio, no metadata, no assets. Used to auto-discard junk
 * tracks when the user exits the editor without touching a misclicked new row.
 */
export function isPristineNewTrack(track: Track, assetCount: number): boolean {
  const t = track.title.trim();
  return (
    (t === "" || t === "Untitled") &&
    track.bpm == null &&
    !track.key_signature &&
    !(track.genre && track.genre.length) &&
    !(track.mood && track.mood.length) &&
    !(track.tags && track.tags.length) &&
    !(track.producer && track.producer.length) &&
    !(track.description && track.description.trim()) &&
    !track.has_audio &&
    assetCount === 0
  );
}

export function formatSavedAgo(ms: number | null): string {
  if (ms == null) return "";
  const delta = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return "long ago";
}
