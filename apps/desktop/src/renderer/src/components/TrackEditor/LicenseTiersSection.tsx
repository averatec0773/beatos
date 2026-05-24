import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";

import {
  licenseTiers as api,
  type LicenseTier,
  type LicenseTierUpdate,
} from "@/api/license-tiers";
import { useToastStore } from "@/stores/toast";
import { fxConvertedString, SUPPORTED_CURRENCIES } from "@/lib/fx-rates";

interface Props {
  trackId: number;
}

/**
 * Fixed preset slots — always rendered, even when no DB row exists yet.
 * Matches the FILES section pattern (5 fixed asset roles): empty slots show
 * a dashed border placeholder; the user "fills" the slot by typing a price.
 * The slot key matches the deliverable token stored in the DB (lowercased).
 */
const PRESET_SLOTS = [
  { key: "mp3", label: "MP3" },
  { key: "wav", label: "WAV" },
  { key: "stem", label: "STEMS" },
] as const;
type PresetKey = (typeof PRESET_SLOTS)[number]["key"];
const PRESET_KEYS = new Set<string>(PRESET_SLOTS.map((p) => p.key));

const AUTOSAVE_MS = 600;

interface DraftTier {
  id: number;
  name: string;
  deliverables: string[];
  price: string;
  currency: string;
  notes: string;
  priceMemory: Record<string, string>;
  lastNumeric: { amount: number; currency: string } | null;
}

interface EmptyPresetState {
  currency: string;
  price: string;
  creating: boolean;
}

interface PendingCustom {
  name: string;
  price: string;
  currency: string;
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

function emptyPresetDefaults(): Record<PresetKey, EmptyPresetState> {
  return {
    mp3: { currency: "CNY", price: "", creating: false },
    wav: { currency: "CNY", price: "", creating: false },
    stem: { currency: "CNY", price: "", creating: false },
  };
}

export function LicenseTiersSection({ trackId }: Props): React.JSX.Element {
  const [tiers, setTiers] = useState<DraftTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [emptySlots, setEmptySlots] = useState<Record<PresetKey, EmptyPresetState>>(
    emptyPresetDefaults(),
  );
  const [pendingCustom, setPendingCustom] = useState<PendingCustom | null>(null);
  const savingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const createTimers = useRef<Map<PresetKey, ReturnType<typeof setTimeout>>>(new Map());
  const pendingNameRef = useRef<HTMLInputElement | null>(null);

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

  // Reset all local UI state when the track changes — otherwise an in-flight
  // create or a pending custom row would leak from one track to the next
  // (SPA route reuse, per CLAUDE.md rule #6).
  useEffect(() => {
    setLoading(true);
    setEmptySlots(emptyPresetDefaults());
    setPendingCustom(null);
    void reload();
  }, [trackId, reload]);

  useEffect(() => {
    const save = savingTimers.current;
    const create = createTimers.current;
    return () => {
      for (const t of save.values()) clearTimeout(t);
      save.clear();
      for (const t of create.values()) clearTimeout(t);
      create.clear();
    };
  }, []);

  // Categorize server tiers into preset slots vs custom vs legacy bundles.
  // Memoized so each render derives a stable view from the same `tiers`.
  const categorized = useMemo(() => {
    const presetById: Partial<Record<PresetKey, DraftTier>> = {};
    const customs: DraftTier[] = [];
    const legacy: DraftTier[] = [];
    for (const t of tiers) {
      if (t.deliverables.length === 1) {
        const d = t.deliverables[0].toLowerCase();
        if (PRESET_KEYS.has(d)) {
          presetById[d as PresetKey] = t;
        } else {
          customs.push(t);
        }
      } else if (t.deliverables.length === 0) {
        // Pending mid-edit empty row from the legacy schema; surface as a
        // legacy bundle so the user can either fill or delete it.
        legacy.push(t);
      } else {
        legacy.push(t);
      }
    }
    return { presetById, customs, legacy };
  }, [tiers]);

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

  /** Currency switch on a persisted tier — see v0.0.26.2 carve-out: only
   *  save if the destination currency has a memorized price; otherwise the
   *  switch is exploratory (lets the user peek at the placeholder hint
   *  without overwriting backend state with `price=null`). */
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

  async function onDelete(tierId: number): Promise<void> {
    const tier = tiers.find((t) => t.id === tierId);
    if (!tier) return;
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

  /** Empty-preset price input. Updates local state; debounces a CREATE
   *  request once the user has typed a non-empty value. Once created, the
   *  new DraftTier replaces the empty slot on the next render. */
  function onEmptyPresetPriceChange(preset: PresetKey, raw: string): void {
    setEmptySlots((prev) => ({
      ...prev,
      [preset]: { ...prev[preset], price: raw },
    }));
    const existing = createTimers.current.get(preset);
    if (existing) clearTimeout(existing);
    if (raw.trim() === "") return;
    const handle = setTimeout(() => {
      void createPresetTier(preset);
    }, AUTOSAVE_MS);
    createTimers.current.set(preset, handle);
  }

  async function createPresetTier(preset: PresetKey): Promise<void> {
    const slot = emptySlots[preset];
    if (!slot || slot.creating || slot.price.trim() === "") return;
    setEmptySlots((prev) => ({
      ...prev,
      [preset]: { ...prev[preset], creating: true },
    }));
    try {
      const created = await api.create(trackId, {
        name: preset.toUpperCase(),
        deliverables: [preset],
        price: Number(slot.price),
        currency: slot.currency,
      });
      setTiers((prev) => [...prev, toDraft(created)]);
      setEmptySlots((prev) => ({
        ...prev,
        [preset]: { currency: slot.currency, price: "", creating: false },
      }));
    } catch (e) {
      setEmptySlots((prev) => ({
        ...prev,
        [preset]: { ...prev[preset], creating: false },
      }));
      useToastStore.getState().show(
        "error",
        `Add ${preset.toUpperCase()} tier failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  function onEmptyPresetCurrencyChange(preset: PresetKey, currency: string): void {
    setEmptySlots((prev) => ({
      ...prev,
      [preset]: { ...prev[preset], currency },
    }));
  }

  function openPendingCustom(): void {
    if (pendingCustom) return;
    setPendingCustom({ name: "", price: "", currency: "CNY" });
    // Focus the name input on the next paint.
    setTimeout(() => pendingNameRef.current?.focus(), 0);
  }

  function cancelPendingCustom(): void {
    setPendingCustom(null);
  }

  /** Returns null if name passes validation, otherwise a user-facing reason. */
  function validateCustomName(rawName: string): string | null {
    const name = rawName.trim().toLowerCase();
    if (name === "") return "Tier name is required.";
    if (PRESET_KEYS.has(name))
      return `"${name.toUpperCase()}" is a preset — fill the row above instead.`;
    const dupe = tiers.find(
      (t) =>
        t.deliverables.length === 1 && t.deliverables[0].toLowerCase() === name,
    );
    if (dupe) return `A "${name.toUpperCase()}" tier already exists.`;
    return null;
  }

  async function commitPendingCustom(): Promise<void> {
    if (!pendingCustom) return;
    const reason = validateCustomName(pendingCustom.name);
    if (reason) {
      useToastStore.getState().show("warning", reason);
      pendingNameRef.current?.focus();
      return;
    }
    const name = pendingCustom.name.trim();
    const deliverable = name.toLowerCase();
    const priceRaw = pendingCustom.price.trim();
    const parsedPrice =
      priceRaw === "" ? null : Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : null;
    try {
      const created = await api.create(trackId, {
        name,
        deliverables: [deliverable],
        price: parsedPrice,
        currency: pendingCustom.currency,
      });
      setTiers((prev) => [...prev, toDraft(created)]);
      setPendingCustom(null);
    } catch (e) {
      useToastStore.getState().show(
        "error",
        `Add tier failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return (
    <section data-license-tiers className="space-y-2">
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
          License Tiers
        </h3>
        <button
          type="button"
          onClick={openPendingCustom}
          disabled={pendingCustom !== null}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border-subtle hover:bg-bg-row-hover disabled:opacity-50 disabled:cursor-not-allowed"
          data-license-add-tier
        >
          <Plus size={12} />
          Add tier
        </button>
      </header>

      {loading ? (
        <div className="text-xs text-text-tertiary py-4">Loading…</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {PRESET_SLOTS.map((slot) => {
            const tier = categorized.presetById[slot.key];
            if (tier) {
              return (
                <FilledTierRow
                  key={`preset-${slot.key}`}
                  label={slot.label}
                  tier={tier}
                  onPriceChange={(v) => updateLocal(tier.id, { price: v })}
                  onCurrencyChange={(c) => onCurrencyChange(tier.id, c)}
                  onDelete={() => void onDelete(tier.id)}
                />
              );
            }
            const empty = emptySlots[slot.key];
            return (
              <EmptyTierRow
                key={`preset-${slot.key}`}
                label={slot.label}
                price={empty.price}
                currency={empty.currency}
                creating={empty.creating}
                onPriceChange={(v) => onEmptyPresetPriceChange(slot.key, v)}
                onCurrencyChange={(c) => onEmptyPresetCurrencyChange(slot.key, c)}
              />
            );
          })}

          {categorized.customs.map((tier) => (
            <FilledTierRow
              key={`custom-${tier.id}`}
              label={tier.name.trim() || deriveAutoName(tier.deliverables)}
              tier={tier}
              onPriceChange={(v) => updateLocal(tier.id, { price: v })}
              onCurrencyChange={(c) => onCurrencyChange(tier.id, c)}
              onDelete={() => void onDelete(tier.id)}
            />
          ))}

          {categorized.legacy.map((tier) => (
            <FilledTierRow
              key={`legacy-${tier.id}`}
              label={deriveAutoName(tier.deliverables) || "(empty)"}
              tier={tier}
              onPriceChange={(v) => updateLocal(tier.id, { price: v })}
              onCurrencyChange={(c) => onCurrencyChange(tier.id, c)}
              onDelete={() => void onDelete(tier.id)}
            />
          ))}

          {pendingCustom && (
            <PendingCustomRow
              nameInputRef={pendingNameRef}
              value={pendingCustom}
              onChange={(patch) =>
                setPendingCustom((prev) => (prev ? { ...prev, ...patch } : prev))
              }
              onCommit={() => void commitPendingCustom()}
              onCancel={cancelPendingCustom}
            />
          )}
        </div>
      )}
    </section>
  );
}

/** Shared label-column width — matches the FILES section's 140px label
 *  column so LICENSE and FILES rows visually align on the same x-axis. */
const LABEL_WIDTH = "w-[140px]";

interface FilledTierRowProps {
  label: string;
  tier: DraftTier;
  onPriceChange: (raw: string) => void;
  onCurrencyChange: (currency: string) => void;
  onDelete: () => void;
}

function FilledTierRow({
  label,
  tier,
  onPriceChange,
  onCurrencyChange,
  onDelete,
}: FilledTierRowProps): React.JSX.Element {
  const placeholderHint =
    tier.price === "" &&
    tier.lastNumeric &&
    tier.lastNumeric.currency !== tier.currency
      ? fxConvertedString(tier.lastNumeric.amount, tier.lastNumeric.currency, tier.currency)
      : "";
  return (
    <div
      data-license-tier
      data-tier-id={tier.id}
      className="group flex items-center gap-3 px-3 py-2 rounded-md border border-border-subtle bg-bg-elevated"
    >
      <span
        className={`${LABEL_WIDTH} shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary truncate`}
        title={label}
      >
        {label}
      </span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={tier.price}
        onChange={(e) => onPriceChange(e.target.value)}
        placeholder={placeholderHint || "0"}
        title={
          placeholderHint && tier.lastNumeric
            ? `≈ ${placeholderHint} ${tier.currency} (converted from ${tier.lastNumeric.amount} ${tier.lastNumeric.currency})`
            : undefined
        }
        className="flex-1 min-w-0 bg-bg-base border border-border-subtle rounded-md px-3 py-1.5 text-sm tabular-nums"
        aria-label="Price"
        data-fx-placeholder={placeholderHint || undefined}
      />
      <select
        value={tier.currency}
        onChange={(e) => onCurrencyChange(e.target.value)}
        className="w-20 shrink-0 bg-bg-base border border-border-subtle rounded-md px-2 py-1.5 text-sm"
        aria-label="Currency"
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onDelete}
        className="w-7 h-7 flex items-center justify-center rounded text-text-tertiary hover:text-danger hover:bg-bg-row-hover shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label="Delete tier"
        title="Delete tier"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

interface EmptyTierRowProps {
  label: string;
  price: string;
  currency: string;
  creating: boolean;
  onPriceChange: (raw: string) => void;
  onCurrencyChange: (currency: string) => void;
}

function EmptyTierRow({
  label,
  price,
  currency,
  creating,
  onPriceChange,
  onCurrencyChange,
}: EmptyTierRowProps): React.JSX.Element {
  return (
    <div
      data-license-tier
      data-empty="true"
      className="group flex items-center gap-3 px-3 py-2 rounded-md border border-dashed border-border-subtle"
    >
      <span
        className={`${LABEL_WIDTH} shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary truncate`}
      >
        {label}
      </span>
      <input
        type="number"
        min={0}
        step="0.01"
        value={price}
        onChange={(e) => onPriceChange(e.target.value)}
        placeholder="—"
        disabled={creating}
        className="flex-1 min-w-0 bg-transparent border border-border-subtle rounded-md px-3 py-1.5 text-sm tabular-nums placeholder:text-text-tertiary disabled:opacity-50"
        aria-label={`${label} price`}
      />
      <select
        value={currency}
        onChange={(e) => onCurrencyChange(e.target.value)}
        disabled={creating}
        className="w-20 shrink-0 bg-transparent border border-border-subtle rounded-md px-2 py-1.5 text-sm disabled:opacity-50"
        aria-label={`${label} currency`}
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <div className="w-7 shrink-0" aria-hidden />
    </div>
  );
}

interface PendingCustomRowProps {
  value: PendingCustom;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<PendingCustom>) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function PendingCustomRow({
  value,
  nameInputRef,
  onChange,
  onCommit,
  onCancel,
}: PendingCustomRowProps): React.JSX.Element {
  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }
  return (
    <div
      data-license-tier
      data-pending="true"
      className="flex items-center gap-3 px-3 py-2 rounded-md border border-accent/50 bg-bg-elevated"
    >
      <input
        ref={nameInputRef}
        type="text"
        value={value.name}
        onChange={(e) => onChange({ name: e.target.value })}
        onKeyDown={onKeyDown}
        placeholder="Tier name (e.g. MIDI)"
        className={`${LABEL_WIDTH} shrink-0 bg-bg-base border border-border-subtle rounded-md px-2 py-1 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-primary placeholder:text-text-tertiary placeholder:normal-case placeholder:tracking-normal placeholder:font-normal`}
        aria-label="Tier name"
      />
      <input
        type="number"
        min={0}
        step="0.01"
        value={value.price}
        onChange={(e) => onChange({ price: e.target.value })}
        onKeyDown={onKeyDown}
        placeholder="0"
        className="flex-1 min-w-0 bg-bg-base border border-border-subtle rounded-md px-3 py-1.5 text-sm tabular-nums"
        aria-label="Price"
      />
      <select
        value={value.currency}
        onChange={(e) => onChange({ currency: e.target.value })}
        className="w-20 shrink-0 bg-bg-base border border-border-subtle rounded-md px-2 py-1.5 text-sm"
        aria-label="Currency"
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onCommit}
        className="w-7 h-7 flex items-center justify-center rounded text-accent hover:bg-bg-row-hover shrink-0"
        aria-label="Save tier"
        title="Save (Enter)"
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="w-7 h-7 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-bg-row-hover shrink-0"
        aria-label="Cancel"
        title="Cancel (Esc)"
      >
        <X size={14} />
      </button>
    </div>
  );
}
