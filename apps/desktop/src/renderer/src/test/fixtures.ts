import type { Library } from "@/api/libraries";
import type { Track } from "@/api/tracks";

export const sampleLibrary: Library = {
  id: 1,
  name: "TestLib",
  root_path: "/tmp/TestLib",
  created_at: "2026-05-14T00:00:00+00:00",
  is_active: true,
};

export const sampleTrack: Track = {
  id: 1,
  library_id: 1,
  title: "Untitled",
  bpm: null,
  key_signature: null,
  genre: null,
  mood: null,
  tags: null,
  description: null,
  description_draft: null,
  license_type: "lease_basic",
  price: null,
  platform_data: null,
  created_at: "2026-05-14T00:00:00+00:00",
  updated_at: "2026-05-14T00:00:00+00:00",
};
