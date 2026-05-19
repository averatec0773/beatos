import { tracks } from "@/api/tracks";
import { useAssetStore } from "@/stores/assets";
import { useTrackStore } from "@/stores/tracks";

const AUDIO_EXT_TO_ROLE: Record<string, string> = {
  ".wav": "audio_tagged_wav",
  ".mp3": "audio_tagged_mp3",
};

export interface CreateResult {
  created: number;
  skipped: number;
  errors: string[];
}

export async function createTracksFromFiles(files: File[]): Promise<CreateResult> {
  const result: CreateResult = { created: 0, skipped: 0, errors: [] };
  for (const file of files) {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    const role = AUDIO_EXT_TO_ROLE[ext];
    if (!role) {
      result.skipped++;
      continue;
    }
    let absPath: string;
    try {
      absPath = window.beatos.getPathForFile(file);
    } catch (e) {
      result.errors.push(`${file.name}: cannot read path`);
      continue;
    }
    if (!absPath) {
      result.errors.push(`${file.name}: empty path from webUtils`);
      continue;
    }

    const titleStem = file.name.replace(/\.(wav|mp3)$/i, "");
    let created;
    try {
      created = await tracks.create(titleStem);
    } catch (e) {
      result.errors.push(`${file.name}: create failed - ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    try {
      await useAssetStore.getState().attach(created.id, role as any, absPath);
      result.created++;
    } catch (e) {
      // Rollback: delete the orphan track (soft-delete is fine — user can purge from Trash)
      try { await tracks.remove(created.id); } catch { /* best-effort */ }
      result.errors.push(`${file.name}: attach failed - ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  void useTrackStore.getState().refresh();
  void useTrackStore.getState().refreshTotal();
  return result;
}
