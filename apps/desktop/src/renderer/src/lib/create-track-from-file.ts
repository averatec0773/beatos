import { platform } from "@/platform";
import { tracks } from "@/api/tracks";
import { useAssetStore } from "@/stores/assets";
import { useTrackStore } from "@/stores/tracks";
import { applyDefaultLicenseTiers } from "@/lib/default-license-tiers";
import { applyDefaultIsFree } from "@/lib/default-free";

export type AudioTag = "tagged" | "untagged";

// Supported audio import formats. Mirrors beatos_core EXT_TO_FORMAT — keep in
// sync (the server derives + validates the format from the extension on attach).
const AUDIO_IMPORT_EXTS = [".wav", ".mp3", ".flac"];

function roleFor(ext: string, tag: AudioTag): string | null {
  // Role is purely tagged/untagged now; the format rides on the file extension
  // and is derived server-side on attach.
  if (!AUDIO_IMPORT_EXTS.includes(ext)) return null;
  return tag === "tagged" ? "audio_tagged" : "audio_untagged";
}

export interface ImportResult {
  created: number;
  attached: number;
  skipped: number;
  errors: string[];
}

interface PathedFile {
  name: string;
  absPath: string;
  ext: string;
}

function resolveFiles(files: File[]): { ok: PathedFile[]; errors: string[]; skipped: number } {
  const ok: PathedFile[] = [];
  const errors: string[] = [];
  let skipped = 0;
  for (const file of files) {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!AUDIO_IMPORT_EXTS.includes(ext)) {
      skipped++;
      continue;
    }
    let absPath: string;
    try {
      absPath = platform.getPathForFile(file);
    } catch {
      errors.push(`${file.name}: cannot read path`);
      continue;
    }
    if (!absPath) {
      errors.push(`${file.name}: empty path from webUtils`);
      continue;
    }
    ok.push({ name: file.name, absPath, ext });
  }
  return { ok, errors, skipped };
}

export async function importAsNewTracks(files: File[], tag: AudioTag): Promise<ImportResult> {
  const { ok, errors, skipped } = resolveFiles(files);
  const result: ImportResult = { created: 0, attached: 0, skipped, errors };

  for (const f of ok) {
    const role = roleFor(f.ext, tag);
    if (!role) {
      result.skipped++;
      continue;
    }
    const titleStem = f.name.replace(/\.(wav|mp3|flac)$/i, "");
    let created: Awaited<ReturnType<typeof tracks.create>>;
    try {
      created = await tracks.create(titleStem);
    } catch (e) {
      result.errors.push(
        `${f.name}: create failed - ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }
    // Best-effort: copy the user's default license tiers onto the new
    // track in the background. Failures never block the import flow.
    await applyDefaultLicenseTiers(created.id);
    await applyDefaultIsFree(created.id);
    try {
      await useAssetStore.getState().attach(created.id, role as any, f.absPath);
      result.created++;
    } catch (e) {
      try {
        await tracks.purge(created.id); // hard-purge so cascade clears copied tiers
      } catch {
        /* best-effort rollback */
      }
      result.errors.push(
        `${f.name}: attach failed - ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  void useTrackStore.getState().refresh();
  void useTrackStore.getState().refreshTotal();
  return result;
}

export async function attachAudioToTrack(
  files: File[],
  trackId: number,
  tag: AudioTag,
): Promise<ImportResult> {
  const { ok, errors, skipped } = resolveFiles(files);
  const result: ImportResult = { created: 0, attached: 0, skipped, errors };
  if (ok.length !== 1) {
    result.errors.push("attach mode expects exactly one audio file");
    return result;
  }
  const f = ok[0];
  const role = roleFor(f.ext, tag);
  if (!role) {
    result.skipped++;
    return result;
  }
  try {
    await useAssetStore.getState().attach(trackId, role as any, f.absPath, { replace: true });
    result.attached++;
  } catch (e) {
    result.errors.push(`${f.name}: attach failed - ${e instanceof Error ? e.message : String(e)}`);
  }
  void useTrackStore.getState().refresh();
  return result;
}
