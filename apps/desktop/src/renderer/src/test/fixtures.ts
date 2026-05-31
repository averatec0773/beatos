import type { Track } from "@/api/tracks";

export const sampleTrack: Track = {
  id: 1,
  title: "Untitled",
  bpm: null,
  key_signature: null,
  genre: null,
  mood: null,
  tags: null,
  description: null,
  producer: null,
  is_free: false,
  has_audio: false,
  cover_asset_id: null,
  created_at: "2026-05-14T00:00:00+00:00",
  updated_at: "2026-05-14T00:00:00+00:00",
  deleted_at: null,
};

export const sampleTrackWithArrayFields: Track = {
  ...sampleTrack,
  genre: ["Trap Rap"],
  mood: ["Dark"],
  producer: ["averatec0773"],
};
