import type { Track, TrackUpdate } from "@/api/tracks";

export const LICENSE_TYPES = ["lease_basic", "lease_premium", "exclusive"] as const;
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
    license_type: t.license_type,
    price: t.price,
    producer: t.producer,
  };
}

export function formatSavedAgo(ms: number | null): string {
  if (ms == null) return "";
  const delta = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return "long ago";
}
