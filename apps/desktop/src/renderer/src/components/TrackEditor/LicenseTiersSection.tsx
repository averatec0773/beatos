import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

import {
  licenseTiers as api,
  type LicenseTier,
  type LicenseTierUpdate,
} from "@/api/license-tiers";
import { useToastStore } from "@/stores/toast";
import { DeliverablesPicker } from "@/components/TrackEditor/DeliverablesPicker";
import { fxConvertedString, SUPPORTED_CURRENCIES } from "@/lib/fx-rates";

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
  // Per-currency memory of values the user typed in *this* editing session.
  // Switching currency away then back restores the prior value (instead of
  // showing 0). Reset on tier reload — never persisted to backend.
  priceMemory: Record<string, string>;
  // The most recent numeric (amount, currency) the user typed. Drives the
  // <input placeholder> hint when the active currency has no memorized
  // value yet (e.g. first switch CNY → USD).
  lastNumeric: { amount: number; currency: string } | null;
}

function toDraft(t: LicenseTier): DraftTier {
  const currency = t.currency || "CNY";
  const priceStr = t.price == null ? "" : String(t.price);
  return {
    id: t.id,
    name: t.name,
    deliverables: t.deliverables ?? [],
    price: priceStr,
    currency,
    notes: t.notes ?? "",
    priceMemory: priceStr === "" ? {} : { [currency]: priceStr },
    lastNumeric:
      t.price != null && Number.isFinite(t.price) && t.price > 0
        ? { amount: t.price, currency }
        : null,
  };
}

function deriveAutoName(deliverables: string[]): string {
  if (deliverables.length === 0) return "";
  return deliverables.map((d) => d.toUpperCase()).join(" + ");
}

function deliverablesKey(deliverables: string[]): string {
  // Order- and case-insensitive canonical key. Must match the backend's
  // _deliverables_key (sorted, lower-cased, deduped) so the renderer's
  // pre-flight check and the API's enforcement agree.
  return JSON.stringify(
    Array.from(new Set(deliverables.map((d) => d.toLowerCase()))).sort(),
  );
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
    // Pre-flight: changing deliverables to match another tier's set is
    // blocked (server would reject with 400 anyway; this gives the user
    // an immediate revert + toast instead of a flashing toggle followed
    // by a delayed error). Empty deliverables are never considered a
    // duplicate — multiple mid-edit empty rows are fine.
    if (patch.deliverables !== undefined && patch.deliverables.length > 0) {
      const newKey = deliverablesKey(patch.deliverables);
      const conflict = tiers.find(
        (t) =>
          t.id !== tierId &&
          t.deliverables.length > 0 &&
          deliverablesKey(t.deliverables) === newKey,
      );
      if (conflict) {
        useToastStore.getState().show(
          "warning",
          `A tier with the same deliverables already exists (${
            deriveAutoName(conflict.deliverables) || `#${conflict.id}`
          })`,
        );
        return;
      }
    }

    setTiers((prev) => {
      const next = prev.map((t) => {
        if (t.id !== tierId) return t;
        const merged = { ...t, ...patch };
        // Auto-sync the name when the user has never customized it.
        if (patch.deliverables !== undefined && nameIsAuto(t)) {
          merged.name = deriveAutoName(merged.deliverables);
        }
        // Price change: update per-currency memory + lastNumeric snapshot.
        if (patch.price !== undefined) {
          const newPrice = patch.price;
          merged.priceMemory = { ...t.priceMemory };
          if (newPrice === "") {
            delete merged.priceMemory[t.currency];
          } else {
            merged.priceMemory[t.currency] = newPrice;
            const parsed = Number(newPrice);
            if (Number.isFinite(parsed) && parsed > 0) {
              merged.lastNumeric = { amount: parsed, currency: t.currency };
            }
          }
        }
        return merged;
      });
      const target = next.find((t) => t.id === tierId);
      if (target) scheduleSave(tierId, target);
      return next;
    });
  }

  /**
   * Currency switch is intentionally NOT auto-saved when the destination
   * currency has no memorized value:
   *
   *   1. Without this carve-out, a CNY 700 tier would be silently wiped
   *      to {price: null, currency: USD} the moment the user clicked USD
   *      to "peek" at the conversion (bug found right after v0.0.26.1
   *      shipped).
   *   2. Switching to a currency that DOES have memorized value (user
   *      had typed something there earlier in this session) restores
   *      that value and saves it — equivalent to the user re-typing.
   *
   * Net effect: server state stays put until the user actively commits a
   * (price, currency) pair by typing or by round-tripping. Exploratory
   * currency switches are session-local until then.
   */
  function onCurrencyChange(tierId: number, nextCurrency: string): void {
    setTiers((prev) => {
      let shouldSave = false;
      const next = prev.map((t) => {
        if (t.id !== tierId) return t;
        if (nextCurrency === t.currency) return t;
        const memorized = t.priceMemory[nextCurrency];
        const merged: DraftTier = {
          ...t,
          currency: nextCurrency,
          price: memorized ?? "",
        };
        if (memorized !== undefined) shouldSave = true;
        return merged;
      });
      if (shouldSave) {
        const target = next.find((t) => t.id === tierId);
        if (target) scheduleSave(tierId, target);
      }
      return next;
    });
  }

  async function onAdd(): Promise<void> {
    const isFirst = tiers.length === 0;
    // The first-tier MP3 default would collide with an existing ["mp3"]
    // tier on a re-add scenario (rare, but possible if the user
    // deleted-and-re-added or imported a track that already has MP3).
    // Fall back to an empty new row in that case so the user can pick
    // something different.
    const seed: { name: string; deliverables: string[] } = isFirst
      ? { name: "MP3", deliverables: ["mp3"] }
      : { name: "", deliverables: [] };
    if (
      seed.deliverables.length > 0 &&
      tiers.some(
        (t) =>
          t.deliverables.length > 0 &&
          deliverablesKey(t.deliverables) === deliverablesKey(seed.deliverables),
      )
    ) {
      seed.name = "";
      seed.deliverables = [];
    }
    try {
      const created = await api.create(trackId, {
        name: seed.name,
        deliverables: seed.deliverables,
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
            // Placeholder hint: shown only when the input is currently empty
            // AND we have a numeric value typed earlier in a different
            // currency to convert from. Disappears as soon as the user
            // types (native <input> behavior) so it never competes with a
            // real value or lingers as ambient gray noise.
            const placeholderHint =
              tier.price === "" &&
              tier.lastNumeric &&
              tier.lastNumeric.currency !== tier.currency
                ? fxConvertedString(
                    tier.lastNumeric.amount,
                    tier.lastNumeric.currency,
                    tier.currency,
                  )
                : "";
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
                    placeholder={placeholderHint || "0"}
                    title={
                      placeholderHint && tier.lastNumeric
                        ? `≈ ${placeholderHint} ${tier.currency} (converted from ${tier.lastNumeric.amount} ${tier.lastNumeric.currency})`
                        : undefined
                    }
                    className="w-24 bg-bg-base border border-border-subtle rounded-md px-2 py-1.5 text-sm tabular-nums"
                    aria-label="Price"
                    data-fx-placeholder={placeholderHint || undefined}
                  />

                  <select
                    value={tier.currency}
                    onChange={(e) => onCurrencyChange(tier.id, e.target.value)}
                    className="w-20 bg-bg-base border border-border-subtle rounded-md px-2 py-1.5 text-sm"
                    aria-label="Currency"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <div className="flex-1" />

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
