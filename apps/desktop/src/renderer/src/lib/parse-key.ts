export type KeyMode = "major" | "minor";

export interface ParsedKey {
  note: string;
  mode: KeyMode;
}

export function parseKey(s: string | null): ParsedKey | null {
  if (!s) return null;
  const m = /^([A-Ga-g][#b]?)\s+(major|minor)$/i.exec(s.trim());
  if (!m) return null;
  const noteRaw = m[1];
  const note = noteRaw[0].toUpperCase() + noteRaw.slice(1);
  return { note, mode: m[2].toLowerCase() as KeyMode };
}

export function formatKey(note: string, mode: KeyMode): string {
  return `${note} ${mode}`;
}
