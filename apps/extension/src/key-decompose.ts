export type Accidental = "sharp" | "flat" | "natural";
export type Mode = "major" | "minor";
export interface DecomposedKey {
  note: string;
  accidental: Accidental;
  mode: Mode;
}

/**
 * Split a key string like "F# minor" into {note, accidental, mode}.
 * Returns null if it can't be parsed. Mode defaults to "major" when absent.
 */
export function decomposeKey(input: string): DecomposedKey | null {
  if (!input) return null;
  const m = input.trim().match(/^([A-Ga-g])\s*([#♯b♭])?\s*(major|minor|maj|min)?$/);
  if (!m) return null;
  const note = m[1].toUpperCase();
  const acc = m[2];
  const accidental: Accidental =
    acc === "#" || acc === "♯" ? "sharp" : acc === "b" || acc === "♭" ? "flat" : "natural";
  const modeRaw = (m[3] ?? "major").toLowerCase();
  const mode: Mode = modeRaw.startsWith("min") ? "minor" : "major";
  return { note, accidental, mode };
}
