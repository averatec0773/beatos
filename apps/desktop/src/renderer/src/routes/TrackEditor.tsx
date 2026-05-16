import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useBlocker } from "react-router-dom";

import { tracks } from "@/api/tracks";
import { assets as assetsApi } from "@/api/assets";
import { useTrackStore } from "@/stores/tracks";
import { useAssetStore } from "@/stores/assets";
import { CoverDropZone } from "@/components/CoverDropZone";
import { FileRowsSection } from "@/components/FileRowsSection";
import { KeyPicker } from "@/components/KeyPicker";
import type { Track, TrackUpdate } from "@/api/tracks";
import { shallowEqualEditable } from "@/lib/shallow-equal-track";
import { UnsavedChangesDialog } from "@/components/UnsavedChangesDialog";

const LICENSE_TYPES = ["lease_basic", "lease_premium", "exclusive"] as const;

export function TrackEditor(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const updateInStore = useTrackStore((s) => s.update);
  const removeInStore = useTrackStore((s) => s.remove);
  const setAssetsForTrack = useAssetStore((s) => s.setForTrack);

  const [track, setTrack] = useState<Track | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialTrack, setInitialTrack] = useState<Track | null>(null);
  const [navigateAfterSave, setNavigateAfterSave] = useState(false);

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
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, setAssetsForTrack]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") navigate("/");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  useEffect(() => {
    // Auto-focus title on mount
    const el = document.getElementById("track-title");
    if (el) (el as HTMLInputElement).focus();
  }, []);

  useEffect(() => {
    if (!track) return;
    if (!initialTrack || initialTrack.id !== track.id) {
      setInitialTrack(track);
    }
  }, [track, initialTrack]);

  const isDirty = useMemo(() => {
    if (!track || !initialTrack) return false;
    return !shallowEqualEditable(track, initialTrack);
  }, [track, initialTrack]);

  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (navigateAfterSave && !isDirty) {
      setNavigateAfterSave(false);
      navigate("/");
    }
  }, [navigateAfterSave, isDirty, navigate]);

  if (error && !track) return <main className="flex-1 p-8 text-danger">{error}</main>;
  if (!track) return <main className="flex-1 p-8 text-text-tertiary">Loading…</main>;

  async function saveTrack(): Promise<Track> {
    if (!track) throw new Error("No track loaded");
    if (!track.title.trim()) {
      setError("Title is required.");
      throw new Error("Title is required.");
    }
    setSaving(true);
    setError(null);
    try {
      const payload: TrackUpdate = {
        title: track.title,
        bpm: track.bpm,
        key_signature: track.key_signature,
        genre: track.genre,
        mood: track.mood,
        tags: track.tags,
        description: track.description,
        license_type: track.license_type,
        price: track.price,
        producer: track.producer,
      };
      const saved = await updateInStore(track.id, payload);
      setInitialTrack(saved);
      setTrack(saved);
      return saved;
    } catch (err) {
      setError(String(err));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function onSave(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!track) return;
    try {
      await saveTrack();
      setNavigateAfterSave(true);
    } catch {
      // error already set in saveTrack
    }
  }

  async function onDelete(): Promise<void> {
    if (!track) return;
    if (!confirm(`Delete "${track.title}"? This cannot be undone.`)) return;
    await removeInStore(track.id);
    navigate("/");
  }

  function patch<K extends keyof Track>(field: K, value: Track[K]): void {
    setTrack((cur) => (cur ? { ...cur, [field]: value } : cur));
  }

  return (
    <>
    <UnsavedChangesDialog
      open={blocker.state === "blocked"}
      trackTitle={track.title}
      onSave={async () => {
        try {
          await saveTrack();
          blocker.proceed?.();
        } catch {
          // error already set; keep dialog open by not proceeding
        }
      }}
      onDiscard={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
    <main data-track-editor className="beatos-scroll flex-1 overflow-y-auto p-8">
      <form onSubmit={onSave} className="max-w-4xl space-y-6">
        <div className="grid grid-cols-[200px_1fr] gap-6 items-start">
          <CoverDropZone trackId={track.id} />

          <div className="space-y-4">
            <div>
              <label
                htmlFor="track-title"
                className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
              >
                Title
              </label>
              <input
                id="track-title"
                type="text"
                value={track.title}
                onChange={(e) => patch("title", e.target.value)}
                className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
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
              <div>
                <label
                  htmlFor="track-genre"
                  className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
                >
                  Genre
                </label>
                <input
                  id="track-genre"
                  type="text"
                  value={track.genre ?? ""}
                  onChange={(e) => patch("genre", e.target.value || null)}
                  className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="track-mood"
                  className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
                >
                  Mood
                </label>
                <input
                  id="track-mood"
                  type="text"
                  value={track.mood ?? ""}
                  onChange={(e) => patch("mood", e.target.value || null)}
                  className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label
                  htmlFor="track-producer"
                  className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1"
                >
                  Producer
                </label>
                <input
                  id="track-producer"
                  type="text"
                  value={track.producer ?? ""}
                  onChange={(e) => patch("producer", e.target.value || null)}
                  className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2"
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

        {error && <div className="text-danger text-sm">{error}</div>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover"
          >
            Cancel (ESC)
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
