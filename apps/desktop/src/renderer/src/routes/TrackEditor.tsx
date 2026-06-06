import React from "react";
import { useTranslation } from "react-i18next";

import { AnalyzeResultDialog } from "@/components/AnalyzeResultDialog";
import { TrackEditorForm } from "@/components/TrackEditor/TrackEditorForm";
import { useTrackEditorState } from "@/hooks/use-track-editor-state";

export function TrackEditor(): React.JSX.Element {
  const { t } = useTranslation();
  const state = useTrackEditorState();
  const { track, loadError, analyzeDialogOpen, analyzeResult, setAnalyzeDialogOpen, patch } = state;

  if (loadError && !track) {
    return <main className="flex-1 p-8 rounded-xl beatos-card text-danger">{loadError}</main>;
  }
  if (!track) {
    return (
      <main className="flex-1 p-8 rounded-xl beatos-card text-text-tertiary">
        {t("editor.loading")}
      </main>
    );
  }

  return (
    <>
      <AnalyzeResultDialog
        open={analyzeDialogOpen}
        result={analyzeResult}
        currentBpm={track.bpm ?? null}
        currentKey={track.key_signature ?? null}
        onApply={(update) => {
          if (update.bpm != null) patch("bpm", update.bpm);
          if (update.key_signature != null) patch("key_signature", update.key_signature);
          setAnalyzeDialogOpen(false);
        }}
        onClose={() => setAnalyzeDialogOpen(false)}
      />
      <TrackEditorForm track={track} state={state} />
    </>
  );
}
