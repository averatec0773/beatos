export function formatChipLabel(field: string, values: readonly string[]): string {
  if (values.length === 0) return field;
  if (values.length <= 2) return `${field} · ${values.join(", ")}`;
  return `${field} · ${values.length} selected`;
}
