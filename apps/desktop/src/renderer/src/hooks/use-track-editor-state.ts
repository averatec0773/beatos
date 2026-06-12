import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { tracks } from "@/api/tracks";
import type { Track } from "@/api/tracks";
import { assets as assetsApi } from "@/api/assets";
import { analysis } from "@/api/analysis";
import { loadAllProducerNames } from "@/lib/known-producers";
import type { AudioAnalysisResult } from "@/api/analysis";
import { useTrackStore } from "@/stores/tracks";
import { useAssetStore } from "@/stores/assets";
import { useToastStore } from "@/stores/toast";
import { restoreTracks } from "@/lib/trash-actions";
import { useAnalyzingStore } from "@/lib/auto-analyze";
import { shallowEqualEditable } from "@/lib/shallow-equal-track";
import {
  AUTOSAVE_DEBOUNCE_MS,
  buildPayload,
  isPristineNewTrack,
  type SaveState,
} from "@/lib/track-editor-helpers";

export type ProducerOption = { value: string; label: string };

export interface TrackEditorState {
  track: Track | null;
  loadError: string | null;
  isDirty: boolean;
  titleEmpty: boolean;
  saveState: SaveState;
  lastSavedAt: number | null;
  saveErrorMsg: string | null;
  patch: <K extends keyof Track>(field: K, value: Track[K]) => void;
  performSave: (snapshot: Track) => Promise<void>;
  flushAndClose: () => void;
  onDelete: () => Promise<void>;
  producerOptions: ProducerOption[];
  refreshProducerOptions: () => Promise<void>;
  analyzing: boolean;
  analyzeResult: AudioAnalysisResult | null;
  analyzeDialogOpen: boolean;
  runAnalyze: () => Promise<void>;
  setAnalyzeDialogOpen: (open: boolean) => void;
}

export function useTrackEditorState(): TrackEditorState {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const updateInStore = useTrackStore((s) => s.update);
  const removeInStore = useTrackStore((s) => s.remove);
  const setAssetsForTrack = useAssetStore((s) => s.setForTrack);
  const assetsByTrack = useAssetStore((s) => s.byTrack);
  const trackList = useTrackStore((s) => s.list);

  const [track, setTrack] = useState<Track | null>(null);
  const [initialTrack, setInitialTrack] = useState<Track | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [producerOptions, setProducerOptions] = useState<ProducerOption[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const externallyAnalyzing = useAnalyzingStore((s) => (track ? !!s.inflight[track.id] : false));
  const [analyzeResult, setAnalyzeResult] = useState<AudioAnalysisResult | null>(null);
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [, setNowTick] = useState(0);

  const refreshProducerOptions = useCallback(async () => {
    try {
      // Union of used-on-tracks ∪ Settings-registered names so producers
      // the user pre-added in Settings show up in the dropdown even
      // before any track references them.
      const { all } = await loadAllProducerNames();
      setProducerOptions(all.map((p) => ({ value: p, label: p })));
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
    Promise.all([tracks.get(Number(params.id)), assetsApi.listForTrack(Number(params.id))])
      .then(([t, assetList]) => {
        if (!cancelled) {
          setTrack(t);
          setAssetsForTrack(t.id, assetList);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, setAssetsForTrack]);

  useEffect(() => {
    const el = document.getElementById("track-title");
    if (el) (el as HTMLInputElement).focus();
  }, [params.id]);

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
    [updateInStore],
  );

  // Debounced auto-save. Gated on dirty + valid title + no in-flight save +
  // no prior error (user must click Retry to clear an error — prevents
  // tight retry loops against a persistent failure like an offline sidecar).
  useEffect(() => {
    if (!track || !initialTrack) return;
    if (!isDirty) return;
    if (saveState === "saving" || saveState === "error") return;
    if (!track.title.trim()) return;
    const id = window.setTimeout(() => {
      void performSave(track);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [track, initialTrack, isDirty, saveState, performSave]);

  // Tick "Xs ago" once per second so the label stays current.
  useEffect(() => {
    if (saveState !== "saved") return;
    const id = window.setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [saveState]);

  // Remember which track id was created via "Add Track" (navigation state),
  // so we can auto-discard it on exit if left untouched.
  const isNewIdRef = useRef<number | null>(null);
  useEffect(() => {
    const st = location.state as { isNew?: boolean } | null;
    if (st?.isNew && track && isNewIdRef.current == null) {
      isNewIdRef.current = track.id;
    }
  }, [location.state, track]);

  // Discard an untouched freshly-created row (misclick / quick back-out).
  // Returns true if it discarded, so callers skip the normal save/flush.
  const discardedRef = useRef(false);
  const maybeDiscardNew = useCallback((): boolean => {
    if (discardedRef.current) return true;
    if (
      track &&
      isNewIdRef.current === track.id &&
      isPristineNewTrack(track, assetsByTrack[track.id]?.length ?? 0)
    ) {
      discardedRef.current = true;
      void removeInStore(track.id);
      return true;
    }
    return false;
  }, [track, assetsByTrack, removeInStore]);

  // Flush a pending save before navigating away. Fire-and-forget — by the
  // time the promise resolves the editor has unmounted, but the API call
  // still lands in the store. Skips if save is in-flight (it'll complete
  // on its own) or if title is empty (would error out).
  // Persist a sub-debounce edit before we leave. The old guard required
  // saveState === "idle", but saveState never returns to "idle" after the first
  // save (it stays "saved"/"error"), which silently disabled this flush for the
  // rest of the session — losing the last edit. Flush whenever there's a dirty,
  // valid edit and no save is already in flight or errored.
  const flushPendingSave = useCallback(() => {
    if (track && isDirty && saveState !== "saving" && saveState !== "error" && track.title.trim()) {
      void performSave(track);
    }
  }, [track, isDirty, saveState, performSave]);

  const flushAndClose = useCallback(() => {
    if (maybeDiscardNew()) {
      navigate("/");
      return;
    }
    flushPendingSave();
    navigate("/");
  }, [maybeDiscardNew, flushPendingSave, navigate]);

  // Navigating away without ESC/Cancel (e.g. clicking a sidebar item) unmounts
  // the editor. Discard an untouched new row; otherwise flush a pending edit —
  // the autosave timer is cleared on unmount, so without this a change younger
  // than the debounce would be dropped on the way out.
  const maybeDiscardRef = useRef(maybeDiscardNew);
  const flushRef = useRef(flushPendingSave);
  useEffect(() => {
    maybeDiscardRef.current = maybeDiscardNew;
    flushRef.current = flushPendingSave;
  });
  useEffect(() => {
    return () => {
      if (maybeDiscardRef.current()) return;
      flushRef.current();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      // Don't double-fire: if a dialog (e.g. the analyze-result modal) already
      // consumed Escape, or the user is mid-edit in a text field, let that win
      // instead of ejecting them from the whole editor in the same keystroke.
      if (e.defaultPrevented) return;
      const el = e.target;
      if (el instanceof HTMLElement) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) {
          return;
        }
      }
      flushAndClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flushAndClose]);

  const onDelete = useCallback(async () => {
    if (!track) return;
    // Reversible trash move — act immediately and offer Undo (consistent with
    // the row / context-menu delete), no blocking confirm.
    const id = track.id;
    await removeInStore(id);
    navigate("/");
    // Offer Undo on the library we just navigated to (the editor is unmounting).
    useToastStore.getState().show("success", t("trackList.movedToTrash"), 7000, {
      label: t("common.undo"),
      onClick: () => void restoreTracks([id], t),
    });
  }, [t, track, removeInStore, navigate]);

  const patch = useCallback(<K extends keyof Track>(field: K, value: Track[K]): void => {
    setTrack((cur) => (cur ? { ...cur, [field]: value } : cur));
  }, []);

  const runAnalyze = useCallback(async () => {
    if (!track) return;
    // Block manual click while auto-analyze (or a prior manual click) is in
    // flight for this track — sidecar analysis is heavy and concurrent calls
    // for the same track cause user-visible "button stuck" behavior.
    if (useAnalyzingStore.getState().inflight[track.id]) return;
    useAnalyzingStore.getState().setInflight(track.id, true);
    setAnalyzing(true);
    try {
      const result = await analysis.analyze(track.id);
      setAnalyzeResult(result);
      setAnalyzeDialogOpen(true);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      useToastStore.getState().show("error", t("errors.analysisFailed", { detail }));
    } finally {
      setAnalyzing(false);
      useAnalyzingStore.getState().setInflight(track.id, false);
    }
  }, [t, track]);

  return {
    track,
    loadError,
    isDirty,
    titleEmpty,
    saveState,
    lastSavedAt,
    saveErrorMsg,
    patch,
    performSave,
    flushAndClose,
    onDelete,
    producerOptions,
    refreshProducerOptions,
    analyzing: analyzing || externallyAnalyzing,
    analyzeResult,
    analyzeDialogOpen,
    runAnalyze,
    setAnalyzeDialogOpen,
  };
}
