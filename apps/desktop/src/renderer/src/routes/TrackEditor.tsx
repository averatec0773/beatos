import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Wand2 } from "lucide-react";

import { tracks } from "@/api/tracks";
import { assets as assetsApi } from "@/api/assets";
import { distinct } from "@/api/distinct";
import { producers as producersApi } from "@/api/producers";
import { analysis } from "@/api/analysis";
import type { AudioAnalysisResult } from "@/api/analysis";
import { useTrackStore } from "@/stores/tracks";
import { useAssetStore } from "@/stores/assets";
import { CoverDropZone } from "@/components/CoverDropZone";
import { FileRowsSection } from "@/components/FileRowsSection";
import { KeyPicker } from "@/components/KeyPicker";
import { ChipMultiSelect } from "@/components/ChipMultiSelect";
import { AnalyzeResultDialog } from "@/components/AnalyzeResultDialog";
import type { Track, TrackUpdate } from "@/api/tracks";
import { shallowEqualEditable } from "@/lib/shallow-equal-track";
import { BEATOS_GENRES, genreLabel } from "@/data/genres";
import { BEATOS_MOODS } from "@/data/moods";

const LICENSE_TYPES = ["lease_basic", "lease_premium", "exclusive"] as const;
const AUTOSAVE_DEBOUNCE_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error";

function buildPayload(t: Track): TrackUpdate {
  return {
    title: t.title,
    bpm: t.bpm,
    key_signature: t.key_signature,
    genre: t.genre,
    mood: t.mood,
    tags: t.tags,
    description: t.description,
    license_type: t.license_type,
    price: t.price,
    producer: t.producer,
  };
}

function formatSavedAgo(ms: number | null): string {
  if (ms == null) return "";
  const delta = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return "long ago";
}

export function TrackEditor(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const updateInStore = useTrackStore((s) => s.update);
  const removeInStore = useTrackStore((s) => s.remove);
  const setAssetsForTrack = useAssetStore((s) => s.setForTrack);
  const trackList = useTrackStore((s) => s.list);

  const [track, setTrack] = useState<Track | null>(null);
  const [initialTrack, setInitialTrack] = useState<Track | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [producerOptions, setProducerOptions] = useState<{ value: string; label: string }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AudioAnalysisResult | null>(null);
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [, setNowTick] = useState(0);

  const refreshProducerOptions = useCallback(async () => {
    try {
      const vals = await distinct.values("producer");
      setProducerOptions(vals.map((p) => ({ value: p, label: p })));
    } catch {
      /* non-fatal */
    }
  }, []);

  // Re-fetch producers per track id (vocab is global; useEffect([]) is stale
  // across SPA route changes that reuse the same TrackEditor instance).
  useEffect(() => {
    void refreshProducerOptions();
  }, [params.id, refreshProducerOptions]);

  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    Promise.all([
      tracks.get(Number(params.id)),
      assetsApi.listForTrack(Number(params.id)),
    ])
      .then(([t, assetList]) => {
        if (!cancelled) {
          setTrack(t);
          setAssetsForTrack(t.id, assetList);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(String(e));
      });
    return () => { cancelled = true; };
  }, [params.id, setAssetsForTrack]);

  useEffect(() => {
    const el = document.getElementById("track-title");
    if (el) (el as HTMLInputElement).focus();
  }, []);

  // Initial baseline (only on first load of a given track id)
  useEffect(() => {
    if (!track) return;
    if (!initialTrack || initialTrack.id !== track.id) {
      setInitialTrack(track);
    }
  }, [track, initialTrack]);

  // Absorb upstream auto-analyze patches into form fields that are still
  // empty. Writes to both `track` and `initialTrack` so the patch does not
  // register as a user-dirty edit (which would re-fire auto-save).
  const liveTrack = useMemo(() => {
    if (!params.id) return null;
    const id = Number(params.id);
    return trackList.find((t) => t.id === id) ?? null;
  }, [trackList, params.id]);

  useEffect(() => {
    if (!liveTrack || !track || liveTrack.id !== track.id) return;
    const patches: Partial<Track> = {};
    if (track.bpm == null && liveTrack.bpm != null) patches.bpm = liveTrack.bpm;
    if (track.key_signature == null && liveTrack.key_signature != null) {
      patches.key_signature = liveTrack.key_signature;
    }
    if (Object.keys(patches).length === 0) return;
    setTrack((cur) => (cur ? { ...cur, ...patches } : cur));
    setInitialTrack((cur) => (cur ? { ...cur, ...patches } : cur));
  }, [liveTrack?.bpm, liveTrack?.key_signature, track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = useMemo(() => {
    if (!track || !initialTrack) return false;
    return !shallowEqualEditable(track, initialTrack);
  }, [track, initialTrack]);

  const titleEmpty = track != null && !track.title.trim();

  // The single save action. Always sends the snapshot it was called with —
  // if newer edits exist post-save, isDirty stays true and the effect below
  // schedules another save against the latest snapshot.
  const performSave = useCallback(
    async (snapshot: Track) => {
      setSaveState("saving");
      setSaveErrorMsg(null);
      try {
        const saved = await updateInStore(snapshot.id, buildPayload(snapshot));
        // Baseline = what we sent. Newer local edits remain dirty.
        setInitialTrack(saved);
        setSaveState("saved");
        setLastSavedAt(Date.now());
      } catch (err) {
        setSaveState("error");
        setSaveErrorMsg(err instanceof Error ? err.message : String(err));
      }
    },
    [updateInStore]
  );

  // Debounced auto-save. Gated on dirty + valid title + no in-flight save +
  // no prior error (user must click Retry to clear an error — prevents
  // tight retry loops against a persistent failure like an offline sidecar).
  useEffect(() => {
    if (!track || !initialTrack) return;
    if (!isDirty) return;
    if (saveState === "saving" || saveState === "error") return;
    if (!track.title.trim()) return;
    const id = window.setTimeout(() => { void performSave(track); }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [track, initialTrack, isDirty, saveState, performSave]);

  // Tick "Xs ago" once per second so the label stays current.
  useEffect(() => {
    if (saveState !== "saved") return;
    const id = window.setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [saveState]);

  // Flush a pending save before navigating away. Fire-and-forget — by the
  // time the promise resolves the editor has unmounted, but the API call
  // still lands in the store. Skips if save is in-flight (it'll complete
  // on its own) or if title is empty (would error out).
  const flushAndClose = useCallback(() => {
    if (track && isDirty && saveState === "idle" && track.title.trim()) {
      void performSave(track);
    }
    navigate("/");
  }, [track, isDirty, saveState, performSave, navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") flushAndClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushAndClose]);

  if (loadError && !track) return <main className="flex-1 p-8 text-danger">{loadError}</main>;
  if (!track) return <main className="flex-1 p-8 text-text-tertiary">Loading…</main>;

  async function onDelete(): Promise<void> {
    if (!track) return;
    if (!confirm(`Delete "${track.title}"? This cannot be undone.`)) return;
    await removeInStore(track.id);
    navigate("/");
  }

  function patch<K extends keyof Track>(field: K, value: Track[K]): void {
    setTrack((cur) => (cur ? { ...cur, [field]: value } : cur));
  }

  async function runAnalyze(): Promise<void> {
    if (!track) return;
    setAnalyzing(true);
    try {
      const result = await analysis.analyze(track.id);
      setAnalyzeResult(result);
      setAnalyzeDialogOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Analysis failed: ${msg}`);
    } finally {
      setAnalyzing(false);
    }
  }

  function renderSaveIndicator(): React.JSX.Element | null {
    if (titleEmpty) {
      return (
        <span data-save-status="title-required" className="text-danger text-xs">
          Title required to save
        </span>
      );
    }
    if (saveState === "saving") {
      return <span data-save-status="saving" className="text-text-tertiary text-xs">Saving…</span>;
    }
    if (saveState === "error") {
      return (
        <button
          type="button"
          onClick={() => track && void performSave(track)}
          data-save-status="error"
          className="text-danger text-xs hover:underline"
          title={saveErrorMsg ?? undefined}
        >
          Save failed — retry
        </button>
      );
    }
    if (saveState === "saved" && lastSavedAt != null) {
      return (
        <span data-save-status="saved" className="text-text-tertiary text-xs">
          Saved · {formatSavedAgo(lastSavedAt)}
        </span>
      );
    }
    return null;
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
    <main data-track-editor className="beatos-scroll flex-1 overflow-y-auto p-8">
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
                {renderSaveIndicator()}
              </div>
              <input
                id="track-title"
                type="text"
                value={track.title}
                onChange={(e) => patch("title", e.target.value)}
                aria-invalid={titleEmpty}
                className={`w-full bg-bg-elevated border rounded-md px-3 py-2 text-text-primary focus:outline-none ${
                  titleEmpty ? "border-danger focus:border-danger" : "border-border-subtle focus:border-accent"
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
                  onChange={(e) => patch("bpm", e.target.value === "" ? null : Number(e.target.value))}
                  className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label
                  className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
                >
                  Key
                </label>
                <KeyPicker value={track.key_signature ?? null} onChange={(v) => patch("key_signature", v)} />
              </div>
              <div data-field="genre">
                <label
                  className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
                >
                  Genre
                </label>
                <ChipMultiSelect
                  value={track.genre ?? []}
                  options={BEATOS_GENRES.map((g) => ({ value: g.en, label: genreLabel(g) }))}
                  onChange={(v) => patch("genre", v.length ? v : null)}
                  popoverTitle="Genres"
                  placeholder="Add genre..."
                  maxSelections={1}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div data-field="mood">
                <label
                  className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
                >
                  Mood
                </label>
                <ChipMultiSelect
                  value={track.mood ?? []}
                  options={BEATOS_MOODS.map((m) => ({ value: m.en, label: `${m.zh} (${m.en})`, group: m.group }))}
                  onChange={(v) => patch("mood", v.length ? v : null)}
                  popoverTitle="Moods"
                  placeholder="Add mood..."
                  maxSelections={3}
                />
              </div>
              <div data-field="producer">
                <label
                  className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
                >
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
                    await producersApi.rewrite([v], null);
                    await refreshProducerOptions();
                    if (track.producer?.includes(v)) {
                      const next = track.producer.filter((p) => p !== v);
                      patch("producer", next.length ? next : null);
                    }
                  }}
                />
              </div>
              <div>
                <label
                  htmlFor="track-license"
                  className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
                >
                  License
                </label>
                <select
                  id="track-license"
                  value={track.license_type}
                  onChange={(e) => patch("license_type", e.target.value)}
                  className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2"
                >
                  {LICENSE_TYPES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
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
                      .filter(Boolean)
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

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={flushAndClose}
            className="px-4 py-2 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover"
          >
            Close (ESC)
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onDelete}
            className="text-danger text-sm hover:underline"
          >
            Delete
          </button>
        </div>
      </form>
    </main>
    </>
  );
}
