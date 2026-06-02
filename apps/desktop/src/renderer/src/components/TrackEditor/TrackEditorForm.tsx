import React, { useState } from "react";
import { Wand2, Share2 } from "lucide-react";

import type { Track } from "@/api/tracks";
import { producers as producersApi } from "@/api/producers";
import { useToastStore } from "@/stores/toast";
import { CoverDropZone } from "@/components/CoverDropZone";
import { FileRowsSection } from "@/components/FileRowsSection";
import { KeyPicker } from "@/components/KeyPicker";
import { ChipMultiSelect } from "@/components/ChipMultiSelect";
import { BEATOS_GENRES } from "@/data/genres";
import { BEATOS_MOODS } from "@/data/moods";
import { formatVocabLabel } from "@/data/vocab-label";
import { useVocabLocaleStore } from "@/stores/vocab-locale";
import { SaveIndicator } from "@/components/TrackEditor/SaveIndicator";
import { LicenseTiersSection } from "@/components/TrackEditor/LicenseTiersSection";
import { ExportDialog } from "@/components/ExportDialog";
import type { TrackEditorState } from "@/hooks/use-track-editor-state";

export interface TrackEditorFormProps {
  track: Track;
  state: TrackEditorState;
}

export function TrackEditorForm({ track, state }: TrackEditorFormProps): React.JSX.Element {
  const [exportOpen, setExportOpen] = useState(false);

  const vocabLocale = useVocabLocaleStore((s) => s.locale);

  const {
    titleEmpty,
    saveState,
    saveErrorMsg,
    lastSavedAt,
    patch,
    performSave,
    flushAndClose,
    onDelete,
    producerOptions,
    refreshProducerOptions,
    analyzing,
    runAnalyze,
  } = state;

  return (
    <main data-track-editor className="beatos-scroll flex-1 overflow-y-auto p-8 rounded-xl beatos-card">
      <form className="max-w-4xl space-y-6" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-[200px_1fr] gap-6 items-start">
          <div className="flex flex-col items-stretch gap-2">
            <CoverDropZone trackId={track.id} />
            <button
              type="button"
              data-analyze-button
              disabled={!track.has_audio || analyzing}
              onClick={runAnalyze}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border-subtle px-3 py-2 text-xs text-text-primary hover:bg-bg-row-hover disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              title={!track.has_audio ? "Attach audio first" : "Analyze BPM and Key"}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {analyzing ? "Analyzing…" : "Analyze audio"}
            </button>
            <button
              type="button"
              data-export-button
              onClick={() => setExportOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border-subtle px-3 py-2 text-xs text-text-primary hover:bg-bg-row-hover"
              title="导出元数据到平台"
            >
              <Share2 className="h-3.5 w-3.5" />
              导出元数据
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label
                  htmlFor="track-title"
                  className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary"
                >
                  Title
                </label>
                <SaveIndicator
                  titleEmpty={titleEmpty}
                  saveState={saveState}
                  saveErrorMsg={saveErrorMsg}
                  lastSavedAt={lastSavedAt}
                  onRetry={() => void performSave(track)}
                />
              </div>
              <input
                id="track-title"
                type="text"
                value={track.title}
                onChange={(e) => patch("title", e.target.value)}
                aria-invalid={titleEmpty}
                className={`w-full bg-bg-elevated border rounded-md px-3 py-2 text-text-primary focus:outline-none ${
                  titleEmpty
                    ? "border-danger focus:border-danger"
                    : "border-border-subtle focus:border-accent"
                }`}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="track-bpm"
                  className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
                >
                  BPM
                </label>
                <input
                  id="track-bpm"
                  type="number"
                  value={track.bpm ?? ""}
                  onChange={(e) =>
                    patch("bpm", e.target.value === "" ? null : Number(e.target.value))
                  }
                  className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1">
                  Key
                </label>
                <KeyPicker
                  value={track.key_signature ?? null}
                  onChange={(v) => patch("key_signature", v)}
                />
              </div>
              <div data-field="genre">
                <label className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1">
                  Genre
                </label>
                <ChipMultiSelect
                  value={track.genre ?? []}
                  options={BEATOS_GENRES.map((g) => ({
                    value: g.en,
                    label: formatVocabLabel(g.en, "genre", vocabLocale),
                  }))}
                  onChange={(v) => patch("genre", v.length ? v : null)}
                  popoverTitle="Genres"
                  placeholder="Add genre..."
                  maxSelections={1}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div data-field="mood">
                <label className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1">
                  Mood
                </label>
                <ChipMultiSelect
                  value={track.mood ?? []}
                  options={BEATOS_MOODS.map((m) => ({
                    value: m.en,
                    label: formatVocabLabel(m.en, "mood", vocabLocale),
                    group: m.group,
                  }))}
                  onChange={(v) => patch("mood", v.length ? v : null)}
                  popoverTitle="Moods"
                  placeholder="Add mood..."
                  maxSelections={3}
                />
              </div>
              <div data-field="producer">
                <label className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1">
                  Producer
                </label>
                <ChipMultiSelect
                  value={track.producer ?? []}
                  options={producerOptions}
                  onChange={(v) => patch("producer", v.length ? v : null)}
                  allowCustomAdd
                  popoverTitle="Producers"
                  placeholder="Add producer..."
                  onRenameOption={async (oldV, newV) => {
                    await producersApi.rewrite([oldV], newV);
                    await refreshProducerOptions();
                    if (track.producer?.includes(oldV)) {
                      patch(
                        "producer",
                        track.producer.map((p) => (p === oldV ? newV : p)),
                      );
                    }
                  }}
                  onDeleteOption={async (v) => {
                    try {
                      const r = await producersApi.rewrite([v], null);
                      await refreshProducerOptions();
                      if (track.producer?.includes(v)) {
                        const next = track.producer.filter((p) => p !== v);
                        patch("producer", next.length ? next : null);
                      }
                      useToastStore
                        .getState()
                        .show(
                          "success",
                          `Deleted "${v}" from ${r.affected} track${r.affected === 1 ? "" : "s"}`,
                        );
                    } catch (e) {
                      useToastStore
                        .getState()
                        .show(
                          "error",
                          `Delete failed: ${e instanceof Error ? e.message : String(e)}`,
                        );
                      throw e;
                    }
                  }}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="track-tags"
                className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
              >
                Tags (comma-separated)
              </label>
              <input
                id="track-tags"
                type="text"
                value={track.tags ? track.tags.join(", ") : ""}
                onChange={(e) =>
                  patch(
                    "tags",
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="track-description"
                className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
              >
                Description
              </label>
              <textarea
                id="track-description"
                value={track.description ?? ""}
                onChange={(e) => patch("description", e.target.value || null)}
                rows={4}
                className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2 resize-y"
              />
            </div>
          </div>
        </div>

        <FileRowsSection trackId={track.id} />

        <LicenseTiersSection trackId={track.id} isFree={track.is_free} />

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={flushAndClose}
            className="px-4 py-2 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover"
          >
            Close (ESC)
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onDelete} className="text-danger text-sm hover:underline">
            Delete
          </button>
        </div>
      </form>
      <ExportDialog open={exportOpen} trackId={track.id} onClose={() => setExportOpen(false)} />
    </main>
  );
}
