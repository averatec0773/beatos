export function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) {
    const kb = bytes / KB;
    return kb < 10 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`;
  }
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(1)} GB`;
}
