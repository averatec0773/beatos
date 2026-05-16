export function formatRowDate(iso: string | null): string {
  if (!iso) return "—";
  // Fast path: extract YYYY-MM-DD directly from the string (avoids timezone shifts).
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return "—";
  // Validate the date is real by parsing the extracted portion.
  const d = new Date(match[1] + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return match[1];
}
