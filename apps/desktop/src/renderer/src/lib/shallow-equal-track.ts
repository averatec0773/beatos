import type { Track } from "@/api/tracks";

type EditableFields = Pick<
  Track,
  | "title"
  | "bpm"
  | "key_signature"
  | "genre"
  | "mood"
  | "tags"
  | "description"
  | "license_type"
  | "price"
  | "producer"
>;

export function shallowEqualEditable(a: EditableFields, b: EditableFields): boolean {
  if (a.title !== b.title) return false;
  if (a.bpm !== b.bpm) return false;
  if (a.key_signature !== b.key_signature) return false;
  if (a.genre !== b.genre) return false;
  if (a.mood !== b.mood) return false;
  if (JSON.stringify(a.tags) !== JSON.stringify(b.tags)) return false;
  if (a.description !== b.description) return false;
  if (a.license_type !== b.license_type) return false;
  if (a.price !== b.price) return false;
  if (a.producer !== b.producer) return false;
  return true;
}
