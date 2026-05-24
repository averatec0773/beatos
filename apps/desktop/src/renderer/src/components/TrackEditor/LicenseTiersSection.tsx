import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

import {
  licenseTiers as api,
  type LicenseTier,
  type LicenseTierUpdate,
} from "@/api/license-tiers";
import { useToastStore } from "@/stores/toast";
import { DeliverablesPicker } from "@/components/TrackEditor/DeliverablesPicker";
import { buildFxHint, SUPPORTED_CURRENCIES } from "@/lib/fx-rates";

interface Props {
  trackId: number;
}

const DEFAULT_DELIVERABLES = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "stem", label: "Stems" },
];

const AUTOSAVE_MS = 600;

interface DraftTier {
  id: number;
  // Local form state — synced to server via debounced PUT. Each row owns
  // its own draft so editing one tier never bumps a sibling's input.
  name: string;
  deliverables: string[];
  price: string; // string for input control; parsed to number on save
  currency: string;
  notes: string;
}

function toDraft(t: LicenseTier): DraftTier {
  return {
    id: t.id,
    name: t.name,
    deliverables: t.deliverables ?? [],
    price: t.price == null ? "" : String(t.price),
    currency: t.currency || "CNY",
    notes: t.notes ?? "",
  };
}

function deriveAutoName(deliverables: string[]): string {
  if (deliverables.length === 0) return "";
  return deliverables.map((d) => d.toUpperCase()).join(" + ");
}

/**
 * The "name" column is gone from the row UI; only the optional ⋮ expand
 * exposes it. When the user has not set a custom name, we silently keep
 * `name` in sync with the deliverables join so the row's display label
 * (and any future MCP / adapter consumer) reads sensibly. Custom names
 * are preserved verbatim.
 */
function nameIsAuto(draft: DraftTier): boolean {
  if (draft.name.trim() === "") return true;
  return draft.name === deriveAutoName(draft.deliverables);
}

function draftToUpdate(d: DraftTier): LicenseTierUpdate {
  const trimmedPrice = d.price.trim();
  const parsedPrice =
    trimmedPrice === ""
      ? null
      : Number.isFinite(Number(trimmedPrice))
        ? Number(trimmedPrice)
        : null;
  const effectiveName = d.name.trim() === "" ? deriveAutoName(d.deliverables) : d.name;
  return {
    name: effectiveName || "Untitled tier",
    deliverables: d.deliverables,
    price: parsedPrice,
    currency: d.currency || "CNY",
    notes: d.notes.trim() === "" ? null : d.notes,
  };
}

export function LicenseTiersSection({ trackId }: Props): React.JSX.Element {
  const [tiers, setTiers] = useState<DraftTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const savingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const reload = useCallback(async (): Promise<void> => {
    try {
      const list = await api.listForTrack(trackId);
      setTiers(list.map(toDraft));
    } catch (e) {
      console.warn("[license-tiers] load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [trackId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    const timers = savingTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  function scheduleSave(tierId: number, next: DraftTier): void {
    const existing = savingTimers.current.get(tierId);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(async () => {
      try {
        await api.update(tierId, draftToUpdate(next));
      } catch (e) {
        useToastStore.getState().show(
          "error",
          `Save tier failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        savingTimers.current.delete(tierId);
      }
    }, AUTOSAVE_MS);
    savingTimers.current.set(tierId, handle);
  }

  function updateLocal(tierId: number, patch: Partial<DraftTier>): void {
    setTiers((prev) => {
      const next = prev.map((t) => {
        if (t.id !== tierId) return t;
        const merged = { ...t, ...patch };
        // Auto-sync the name when the user has never customized it (or the
        // current name still matches the auto-derived one). Touching
        // deliverables then updates the row label without forcing a rename.
        if (patch.deliverables !== undefined && nameIsAuto(t)) {
          merged.name = deriveAutoName(merged.deliverables);
        }
        return merged;
      });
      const target = next.find((t) => t.id === tierId);
      if (target) scheduleSave(tierId, target);
      return next;
    });
  }

  async function onAdd(): Promise<void> {
    const isFirst = tiers.length === 0;
    try {
      const created = await api.create(trackId, {
        // Auto-name follows from deliverables so the row label reads sensibly
        // without forcing the user through a Name input.
        name: isFirst ? "MP3" : "",
        deliverables: isFirst ? ["mp3"] : [],
        currency: "CNY",
      });
      setTiers((prev) => [...prev, toDraft(created)]);
    } catch (e) {
      useToastStore.getState().show(
        "error",
        `Add tier failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async function onDelete(tierId: number): Promise<void> {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return;
    const label = tier.name.trim() || deriveAutoName(tier.deliverables) || `tier #${tierId}`;
    if (!confirm(`Delete tier "${label}"?`)) return;
    const pending = savingTimers.current.get(tierId);
    if (pending) {
      clearTimeout(pending);
      savingTimers.current.delete(tierId);
    }
    try {
      await api.remove(tierId);
      setTiers((prev) => prev.filter((t) => t.id !== tierId));
      if (expandedId === tierId) setExpandedId(null);
    } catch (e) {
      useToastStore.getState().show(
        "error",
        `Delete tier failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return (
    <section data-license-tiers className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
          License Tiers
        </h2>
        <button
          type="button"
          onClick={() => void onAdd()}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border-subtle hover:bg-bg-row-hover"
          data-license-add-tier
        >
          <Plus size={12} />
          Add tier
        </button>
      </header>

      {loading ? (
        <div className="text-xs text-text-tertiary py-4">Loading…</div>
      ) : tiers.length === 0 ? (
        <div className="text-xs text-text-tertiary py-4 px-3 rounded border border-dashed border-border-subtle">
          No tiers yet. Add one to define a sellable variant (e.g. MP3 lease,
          WAV+stems exclusive).
        </div>
      ) : (
        <div className="space-y-1">
          {tiers.map((tier) => {
            const expanded = expandedId === tier.id;
            const priceNum = tier.price.trim() === "" ? null : Number(tier.price);
            const hint = buildFxHint(
              priceNum != null && Number.isFinite(priceNum) ? priceNum : null,
              tier.currency,
            );
            return (
              <div
                key={tier.id}
                data-license-tier
                className="rounded-md border border-border-subtle bg-bg-elevated"
              >
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : tier.id)}
                    className="text-text-tertiary hover:text-text-primary p-1 rounded shrink-0"
                    aria-label={expanded ? "Collapse advanced fields" : "Expand advanced fields"}
                    title="Name / notes"
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  <DeliverablesPicker
                    value={tier.deliverables}
                    onChange={(v) => updateLocal(tier.id, { deliverables: v })}
                    presetOptions={DEFAULT_DELIVERABLES}
                    placeholder="Select mp3, wav, stem…"
                    className="flex-1 min-w-[140px]"
                  />

                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={tier.price}
                    onChange={(e) => updateLocal(tier.id, { price: e.target.value })}
                    placeholder="0"
                    className="w-24 bg-bg-base border border-border-subtle rounded-md px-2 py-1.5 text-sm tabular-nums"
                    aria-label="Price"
                  />

                  <select
                    value={tier.currency}
                    onChange={(e) => updateLocal(tier.id, { currency: e.target.value })}
                    className="w-20 bg-bg-base border border-border-subtle rounded-md px-2 py-1.5 text-sm"
                    aria-label="Currency"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <span
                    className="text-xs text-text-tertiary tabular-nums truncate hidden sm:inline"
                    title={hint || "Enter a price to see conversions"}
                    data-fx-hint
                  >
                    {hint}
                  </span>

                  <div className="flex-1 sm:hidden" />

                  <button
                    type="button"
                    onClick={() => void onDelete(tier.id)}
                    className="text-text-tertiary hover:text-danger p-1.5 rounded shrink-0"
                    aria-label="Delete tier"
                    title="Delete tier"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {expanded && (
                  <div className="border-t border-border-subtle px-3 py-3 space-y-3 bg-bg-base">
                    <div>
                      <label className="block text-[11px] text-text-tertiary mb-1">
                        Custom name (optional — defaults to deliverables)
                      </label>
                      <input
                        type="text"
                        value={tier.name}
                        onChange={(e) => updateLocal(tier.id, { name: e.target.value })}
                        placeholder={deriveAutoName(tier.deliverables) || "Tier name"}
                        className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-text-tertiary mb-1">
                        Notes
                      </label>
                      <textarea
                        value={tier.notes}
                        onChange={(e) => updateLocal(tier.id, { notes: e.target.value })}
                        placeholder="Restrictions, terms, etc."
                        rows={2}
                        className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-1.5 text-sm resize-y"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
