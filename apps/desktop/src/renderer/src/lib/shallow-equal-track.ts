import type { Track } from "@/api/tracks";

type EditableFields = Pick<
  Track,
  "title" | "bpm" | "key_signature" | "genre" | "mood" | "tags" | "description" | "producer"
>;

export function shallowEqualEditable(a: EditableFields, b: EditableFields): boolean {
  if (a.title !== b.title) return false;
  if (a.bpm !== b.bpm) return false;
  if (a.key_signature !== b.key_signature) return false;
  if (JSON.stringify(a.genre) !== JSON.stringify(b.genre)) return false;
  if (JSON.stringify(a.mood) !== JSON.stringify(b.mood)) return false;
  if (JSON.stringify(a.tags) !== JSON.stringify(b.tags)) return false;
  if (a.description !== b.description) return false;
  if (JSON.stringify(a.producer) !== JSON.stringify(b.producer)) return false;
  return true;
}
