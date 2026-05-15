import type { Source } from "@/api/sources";

export function isPathOffline(absPath: string, sources: Source[]): boolean {
  const offlineSources = sources.filter((s) => s.status === "offline");
  return offlineSources.some(
    (s) => absPath === s.root_path || absPath.startsWith(s.root_path + "/")
  );
}
