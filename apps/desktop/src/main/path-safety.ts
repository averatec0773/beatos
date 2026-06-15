/**
 * Validation for renderer-supplied filesystem paths that reach a main-process
 * sink (mkdir, drag-out, config write). A path is "safe" only if it is a
 * non-empty absolute path with no parent-directory (`..`) segment. Centralized
 * so every IPC path sink validates identically (the drag-out handler has always
 * applied this guard; the mkdir sinks historically did not).
 */
export function isSafeAbsolutePath(p: unknown): p is string {
  if (typeof p !== "string" || p.length === 0) return false;
  const isAbsolute = process.platform === "win32" ? /^[a-zA-Z]:[\\/]/.test(p) : p.startsWith("/");
  return isAbsolute && !p.includes("..");
}
