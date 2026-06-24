/**
 * Trigger a browser download of a Blob. Works identically in Electron and the
 * web build (both Chromium) — no Electron-only API. Used by the license-PDF and
 * tagged-MP3 export flows (binary responses fetched via api/client.apiPostBlob).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
