export function formatPlayerSubtitle(opts: {
  producer: string | null;
  bpm: number | null;
  key: string | null;
}): string {
  const p = opts.producer || "—";
  const b = opts.bpm != null ? `${opts.bpm} BPM` : "— BPM";
  const k = opts.key || "—";
  return `${p} · ${b} · ${k}`;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
