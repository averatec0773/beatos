import { analysis } from "@/api/analysis";
import { tracks } from "@/api/tracks";
import { useTrackStore } from "@/stores/tracks";
import {
  BPM_AUTOFILL_THRESHOLD,
  KEY_AUTOFILL_THRESHOLD,
} from "@/lib/audio-analysis-constants";

export async function maybeAutoAnalyze(trackId: number): Promise<void> {
  try {
    const t = await tracks.get(trackId);
    if (t.bpm != null && t.key_signature != null) return;
    const result = await analysis.analyze(trackId);
    const patch: Partial<{ bpm: number; key_signature: string }> = {};
    if (
      t.bpm == null &&
      result.bpm != null &&
      (result.bpm_confidence ?? 0) >= BPM_AUTOFILL_THRESHOLD
    ) {
      patch.bpm = Math.round(result.bpm);
    }
    if (
      t.key_signature == null &&
      result.key != null &&
      (result.key_confidence ?? 0) >= KEY_AUTOFILL_THRESHOLD
    ) {
      patch.key_signature = result.key;
    }
    if (Object.keys(patch).length > 0) {
      await tracks.update(trackId, patch as any);
      void useTrackStore.getState().refresh();
      console.info("[auto-analyze] applied", patch);
    }
  } catch (e) {
    console.warn("[auto-analyze] failed", e);
  }
}
