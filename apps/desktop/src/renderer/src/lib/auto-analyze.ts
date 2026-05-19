import { create } from "zustand";

import { analysis } from "@/api/analysis";
import { tracks } from "@/api/tracks";
import { useTrackStore } from "@/stores/tracks";
import { useToastStore } from "@/stores/toast";
import {
  BPM_AUTOFILL_THRESHOLD,
  KEY_AUTOFILL_THRESHOLD,
} from "@/lib/audio-analysis-constants";

interface AnalyzingState {
  inflight: Record<number, boolean>;
  setInflight: (trackId: number, value: boolean) => void;
}

// Shared analysis-in-flight signal. Both `maybeAutoAnalyze` (audio-asset
// import path) and the manual "Analyze audio" button write here so a single
// import that attaches multiple audio roles can't fan out into N concurrent
// sidecar calls, and so the manual button reflects auto-analysis progress.
export const useAnalyzingStore = create<AnalyzingState>((set) => ({
  inflight: {},
  setInflight(trackId, value) {
    set((s) => ({ inflight: { ...s.inflight, [trackId]: value } }));
  },
}));

export async function maybeAutoAnalyze(trackId: number): Promise<void> {
  const store = useAnalyzingStore.getState();
  if (store.inflight[trackId]) {
    console.info("[auto-analyze] skip — already running for track", trackId);
    return;
  }
  store.setInflight(trackId, true);
  const toast = useToastStore.getState();
  try {
    const t = await tracks.get(trackId);
    if (t.bpm != null && t.key_signature != null) return;
    console.info("[auto-analyze] start track", trackId);
    const result = await analysis.analyze(trackId);

    const wantBpm = t.bpm == null && result.bpm != null;
    const wantKey = t.key_signature == null && result.key != null;
    const bpmConf = result.bpm_confidence ?? 0;
    const keyConf = result.key_confidence ?? 0;
    const bpmGood = bpmConf >= BPM_AUTOFILL_THRESHOLD;
    const keyGood = keyConf >= KEY_AUTOFILL_THRESHOLD;

    const patch: Partial<{ bpm: number; key_signature: string }> = {};
    if (wantBpm && bpmGood) patch.bpm = Math.round(result.bpm as number);
    if (wantKey && keyGood) patch.key_signature = result.key as string;

    if (Object.keys(patch).length > 0) {
      await tracks.update(trackId, patch as any);
      void useTrackStore.getState().refresh();
      const parts: string[] = [];
      if (patch.bpm != null) parts.push(`BPM ${patch.bpm}`);
      if (patch.key_signature != null) parts.push(`Key ${patch.key_signature}`);
      console.info("[auto-analyze] applied", patch);
      toast.show("success", `Auto-detected ${parts.join(" · ")}`);

      // If one passed and the other didn't, also surface the low-conf miss
      const skippedParts: string[] = [];
      if (wantBpm && !bpmGood) {
        skippedParts.push(`BPM ${Math.round(result.bpm ?? 0)} (conf ${bpmConf.toFixed(2)})`);
      }
      if (wantKey && !keyGood) {
        skippedParts.push(`Key ${result.key} (conf ${keyConf.toFixed(2)})`);
      }
      if (skippedParts.length > 0) {
        toast.show(
          "warning",
          `Low confidence (not applied): ${skippedParts.join(" · ")} — click "Analyze audio" to review`,
          6000
        );
      }
    } else if (wantBpm || wantKey) {
      // Got values back but confidence too low for any auto-fill
      const parts: string[] = [];
      if (wantBpm) parts.push(`BPM ${Math.round(result.bpm ?? 0)} (conf ${bpmConf.toFixed(2)})`);
      if (wantKey) parts.push(`Key ${result.key} (conf ${keyConf.toFixed(2)})`);
      console.info("[auto-analyze] low confidence, not applied", { bpmConf, keyConf, result });
      toast.show(
        "warning",
        `Analysis low confidence: ${parts.join(" · ")} — click "Analyze audio" to review`,
        6000
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[auto-analyze] failed", e);
    toast.show("error", `Auto-analyze failed: ${msg}`, 6000);
  } finally {
    useAnalyzingStore.getState().setInflight(trackId, false);
  }
}
