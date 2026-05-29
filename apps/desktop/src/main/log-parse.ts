const UVICORN_LEVEL_RE = /^(INFO|WARNING|ERROR|DEBUG|CRITICAL):/;

export function parseUvicornLevel(
  line: string,
  fallback: "info" | "error",
): "info" | "warn" | "error" | "debug" {
  const m = UVICORN_LEVEL_RE.exec(line);
  if (!m) return fallback;
  const lvl = m[1];
  if (lvl === "WARNING") return "warn";
  if (lvl === "ERROR" || lvl === "CRITICAL") return "error";
  if (lvl === "DEBUG") return "debug";
  return "info";
}
