import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AudioAnalysisResult } from "@/api/analysis";
import { BPM_AUTOFILL_THRESHOLD, KEY_AUTOFILL_THRESHOLD } from "@/lib/audio-analysis-constants";

interface Props {
  open: boolean;
  result: AudioAnalysisResult | null;
  currentBpm: number | null;
  currentKey: string | null;
  onApply: (patch: { bpm?: number; key_signature?: string }) => void;
  onClose: () => void;
}

function defaultChecked(
  fieldEmpty: boolean,
  confidence: number | null,
  threshold: number,
  replaceExisting: boolean,
): boolean {
  const aboveThreshold = confidence != null && confidence >= threshold;
  if (replaceExisting) return aboveThreshold;
  return fieldEmpty && aboveThreshold;
}

export function AnalyzeResultDialog({
  open,
  result,
  currentBpm,
  currentKey,
  onApply,
  onClose,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [bpmChecked, setBpmChecked] = useState(false);
  const [keyChecked, setKeyChecked] = useState(false);

  // Recompute defaults when dialog opens or result/replaceExisting changes
  useEffect(() => {
    if (!open || !result) return;
    setBpmChecked(
      defaultChecked(
        currentBpm == null,
        result.bpm_confidence,
        BPM_AUTOFILL_THRESHOLD,
        replaceExisting,
      ),
    );
    setKeyChecked(
      defaultChecked(
        currentKey == null,
        result.key_confidence,
        KEY_AUTOFILL_THRESHOLD,
        replaceExisting,
      ),
    );
  }, [open, result, replaceExisting, currentBpm, currentKey]);

  // Reset replaceExisting when dialog closes
  useEffect(() => {
    if (!open) setReplaceExisting(false);
  }, [open]);

  function handleApply(): void {
    const patch: { bpm?: number; key_signature?: string } = {};
    if (bpmChecked && result?.bpm != null) {
      patch.bpm = Math.round(result.bpm);
    }
    if (keyChecked && result?.key != null) {
      patch.key_signature = result.key;
    }
    onApply(patch);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogContent data-analyze-dialog onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("dialogs.analyzeResult.title")}</DialogTitle>
          <DialogDescription>{t("dialogs.analyzeResult.desc")}</DialogDescription>
        </DialogHeader>

        {result && (
          <div className="space-y-3 my-2">
            {/* BPM row */}
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2 border-b border-border-subtle">
              <input
                type="checkbox"
                id="analyze-bpm-check"
                checked={bpmChecked}
                disabled={result.bpm == null}
                onChange={(e) => setBpmChecked(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary w-8">
                  BPM
                </span>
                <span className="text-text-primary font-mono">
                  {result.bpm != null ? Math.round(result.bpm) : "—"}
                </span>
              </div>
              <ConfidenceBadge
                confidence={result.bpm_confidence}
                threshold={BPM_AUTOFILL_THRESHOLD}
              />
            </div>

            {/* Key row */}
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2">
              <input
                type="checkbox"
                id="analyze-key-check"
                checked={keyChecked}
                disabled={result.key == null}
                onChange={(e) => setKeyChecked(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary w-8">
                  Key
                </span>
                <span className="text-text-primary font-mono">{result.key ?? "—"}</span>
              </div>
              <ConfidenceBadge
                confidence={result.key_confidence}
                threshold={KEY_AUTOFILL_THRESHOLD}
              />
            </div>
          </div>
        )}

        {/* Replace existing toggle */}
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none mt-1">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
            data-replace-existing
          />
          {t("dialogs.analyzeResult.replaceExisting")}
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleApply}>{t("common.apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfidenceBadge({
  confidence,
  threshold,
}: {
  confidence: number | null;
  threshold: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  if (confidence == null) {
    return <span className="text-xs text-text-tertiary">—</span>;
  }
  const pct = Math.round(confidence * 100);
  const isLow = confidence < threshold;
  return (
    <span className={isLow ? "text-xs text-warning font-medium" : "text-xs text-text-tertiary"}>
      {isLow ? t("dialogs.analyzeResult.lowConfidence") : ""}
      {pct}%
    </span>
  );
}
