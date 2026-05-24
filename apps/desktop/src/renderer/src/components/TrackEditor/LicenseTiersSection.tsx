import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  licenseTiers as api,
  type LicenseTier,
  type LicenseTierUpdate,
} from "@/api/license-tiers";
import { useToastStore } from "@/stores/toast";
import { ChipMultiSelect } from "@/components/ChipMultiSelect";

interface Props {
  trackId: number;
}

const DEFAULT_DELIVERABLES = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "stem", label: "Stems" },
];

// Currency selector kept intentionally tiny — BeatOS is a single-user catalog
// and the renderer doesn't do FX conversion. Users on other markets can type
// the ISO code if they need something off-list (the field is a plain string).
const CURRENCY_OPTIONS = ["CNY", "USD", "EUR", "JPY", "GBP"];

const AUTOSAVE_MS = 600;

interface DraftTier {
  id: number;
  // Local form state — synced to server via debounced PUT. Each card owns
  // its own draft so editing one tier never bumps a sibling's input.
  name: string;
  deliverables: string[];
  price: string;        // string for input control; parsed to number on save
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

function draftToUpdate(d: DraftTier): LicenseTierUpdate {
  const trimmedPrice = d.price.trim();
  const parsedPrice =
    trimmedPrice === "" ? null : Number.isFinite(Number(trimmedPrice)) ? Number(trimmedPrice) : null;
  return {
    name: d.name,
    deliverables: d.deliverables,
    price: parsedPrice,
    currency: d.currency || "CNY",
    notes: d.notes.trim() === "" ? null : d.notes,
  };
}

export function LicenseTiersSection({ trackId }: Props): React.JSX.Element {
  const [tiers, setTiers] = useState<DraftTier[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Flush any pending debounced saves when this section unmounts (route
  // change). Otherwise a tight Editor-exit could drop the user's last edit
  // before its 600ms autosave fires.
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
      const next = prev.map((t) => (t.id === tierId ? { ...t, ...patch } : t));
      const target = next.find((t) => t.id === tierId);
      if (target) scheduleSave(tierId, target);
      return next;
    });
  }

  async function onAdd(): Promise<void> {
    // Sensible default for the very first tier: name="MP3", deliverables=["mp3"].
    // Subsequent tiers come in unnamed so the user can pick from MP3+WAV /
    // exclusive / etc. without having to clear a stale default.
    const isFirst = tiers.length === 0;
    try {
      const created = await api.create(trackId, {
        name: isFirst ? "MP3" : `Tier ${tiers.length + 1}`,
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
    if (!confirm(`Delete tier "${tier.name}"?`)) return;
    // Cancel any in-flight autosave before deleting — the PUT would 404 against
    // a now-deleted row and bubble a confusing error toast.
    const pending = savingTimers.current.get(tierId);
    if (pending) {
      clearTimeout(pending);
      savingTimers.current.delete(tierId);
    }
    try {
      await api.remove(tierId);
      setTiers((prev) => prev.filter((t) => t.id !== tierId));
    } catch (e) {
      useToastStore.getState().show(
        "error",
        `Delete tier failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const deliverableOptions = useMemo(() => {
    const seen = new Set(DEFAULT_DELIVERABLES.map((o) => o.value));
    const extras: { value: string; label: string }[] = [];
    for (const t of tiers) {
      for (const d of t.deliverables) {
        if (!seen.has(d)) {
          seen.add(d);
          extras.push({ value: d, label: d });
        }
      }
    }
    return [...DEFAULT_DELIVERABLES, ...extras];
  }, [tiers]);

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
        <div className="space-y-3">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              data-license-tier
              className="p-3 rounded-md border border-border-subtle bg-bg-elevated space-y-3"
            >
              <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
                <input
                  type="text"
                  value={tier.name}
                  onChange={(e) => updateLocal(tier.id, { name: e.target.value })}
                  placeholder="Tier name (e.g. MP3 Lease)"
                  className="bg-bg-base border border-border-subtle rounded-md px-3 py-1.5 text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => void onDelete(tier.id)}
                  className="text-text-tertiary hover:text-danger p-1.5 rounded"
                  aria-label="Delete tier"
                  title="Delete tier"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div>
                <label className="block text-[11px] text-text-tertiary mb-1">
                  Deliverables
                </label>
                <ChipMultiSelect
                  value={tier.deliverables}
                  options={deliverableOptions}
                  onChange={(v) => updateLocal(tier.id, { deliverables: v })}
                  allowCustomAdd
                  popoverTitle="Deliverables"
                  placeholder="Add deliverable..."
                />
              </div>

              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div>
                  <label className="block text-[11px] text-text-tertiary mb-1">Price</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={tier.price}
                    onChange={(e) => updateLocal(tier.id, { price: e.target.value })}
                    placeholder="0"
                    className="w-full bg-bg-base border border-border-subtle rounded-md px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-text-tertiary mb-1">Currency</label>
                  <select
                    value={tier.currency}
                    onChange={(e) => updateLocal(tier.id, { currency: e.target.value })}
                    className="w-full bg-bg-base border border-border-subtle rounded-md px-3 py-1.5 text-sm"
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-text-tertiary mb-1">Notes</label>
                <textarea
                  value={tier.notes}
                  onChange={(e) => updateLocal(tier.id, { notes: e.target.value })}
                  placeholder="Restrictions, terms, etc. (optional)"
                  rows={2}
                  className="w-full bg-bg-base border border-border-subtle rounded-md px-3 py-1.5 text-sm resize-y"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
