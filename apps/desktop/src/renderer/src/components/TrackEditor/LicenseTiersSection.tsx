import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";

import { licenseTiers as api, type LicenseTier, type LicenseTierUpdate } from "@/api/license-tiers";
import { useToastStore } from "@/stores/toast";
import { useTrackStore } from "@/stores/tracks";
import {
  PRESET_SLOTS,
  PRESET_KEYS,
  FIXED_CURRENCIES,
  FIXED_CURRENCY_SET,
  OTHER_CURRENCIES,
  LABEL_WIDTH,
  inputsToPrices,
  pickFxSource,
  fxPlaceholderFor,
  type PresetKey,
} from "@/lib/license-price";

interface Props {
  trackId: number;
  isFree: boolean;
}

const AUTOSAVE_MS = 600;

interface DraftTier {
  id: number;
  name: string;
  deliverables: string[];
  /** Per-currency string-form input state. Empty string = currency cleared
   *  (will not be sent in the save payload). */
  priceInputs: Record<string, string>;
  /** Currency code chosen for the optional third slot. null = no third
   *  currency selected. Defaults to the currency present in the tier's
   *  prices map that isn't CNY/USD, when one exists. */
  otherCurrency: string | null;
  notes: string;
  shareInput: string;
}

interface EmptyPresetState {
  priceInputs: Record<string, string>;
  otherCurrency: string | null;
  shareInput: string;
  creating: boolean;
}

interface PendingCustom {
  name: string;
  priceInputs: Record<string, string>;
  otherCurrency: string | null;
  shareInput: string;
}

function pickOtherCurrency(prices: Record<string, number>): string | null {
  for (const code of Object.keys(prices)) {
    if (!FIXED_CURRENCY_SET.has(code)) return code;
  }
  return null;
}

function toDraft(t: LicenseTier): DraftTier {
  const priceInputs: Record<string, string> = {};
  for (const [code, amount] of Object.entries(t.prices)) {
    priceInputs[code] = String(amount);
  }
  return {
    id: t.id,
    name: t.name,
    deliverables: t.deliverables ?? [],
    priceInputs,
    otherCurrency: pickOtherCurrency(t.prices),
    notes: t.notes ?? "",
    shareInput: t.share != null ? String(t.share) : "",
  };
}

function deriveAutoName(deliverables: string[]): string {
  if (deliverables.length === 0) return "";
  return deliverables.map((d) => d.toUpperCase()).join(" + ");
}

function deliverablesKey(deliverables: string[]): string {
  return JSON.stringify(Array.from(new Set(deliverables.map((d) => d.toLowerCase()))).sort());
}

/** Parse a revenue-share (分成) input string to a tier share. Empty / non-numeric / out-of-
 *  range [0,100] all map to null (unset) — so a stray "150" is silently
 *  dropped rather than sent to the API (which would 400 and, on the
 *  auto-create path, retry-loop). The `<input max={100}>` is the first guard;
 *  this is the backstop. */
function parseShare(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function draftToUpdate(d: DraftTier): LicenseTierUpdate {
  const prices = inputsToPrices(d.priceInputs, d.otherCurrency);
  const effectiveName = d.name.trim() === "" ? deriveAutoName(d.deliverables) : d.name;
  return {
    name: effectiveName || "Untitled tier",
    deliverables: d.deliverables,
    prices,
    notes: d.notes.trim() === "" ? null : d.notes,
    share: parseShare(d.shareInput),
  };
}

function emptyPresetDefaults(): Record<PresetKey, EmptyPresetState> {
  return {
    mp3: { priceInputs: {}, otherCurrency: null, shareInput: "", creating: false },
    wav: { priceInputs: {}, otherCurrency: null, shareInput: "", creating: false },
    stem: { priceInputs: {}, otherCurrency: null, shareInput: "", creating: false },
  };
}

export function LicenseTiersSection({ trackId, isFree }: Props): React.JSX.Element {
  const [free, setFree] = useState(isFree);
  useEffect(() => {
    setFree(isFree);
  }, [trackId, isFree]);

  async function onToggleFree(next: boolean): Promise<void> {
    setFree(next); // optimistic
    try {
      await useTrackStore.getState().update(trackId, { is_free: next });
    } catch (e) {
      setFree(!next);
      useToastStore
        .getState()
        .show("error", `设置免费失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const [tiers, setTiers] = useState<DraftTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [emptySlots, setEmptySlots] =
    useState<Record<PresetKey, EmptyPresetState>>(emptyPresetDefaults());
  // Latest committed empty-slot state, read by the debounced create path so it
  // doesn't act on a stale render closure (state updates are async — a debounce
  // fired right after a keystroke would otherwise see the pre-update value).
  // Synced in an effect (writing a ref during render is disallowed by lint).
  const emptySlotsRef = useRef(emptySlots);
  useEffect(() => {
    emptySlotsRef.current = emptySlots;
  }, [emptySlots]);
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
        useToastStore
          .getState()
          .show("error", `Save tier failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        savingTimers.current.delete(tierId);
      }
    }, AUTOSAVE_MS);
    savingTimers.current.set(tierId, handle);
  }

  function updateLocal(tierId: number, mutator: (t: DraftTier) => DraftTier): void {
    setTiers((prev) => {
      const next = prev.map((t) => (t.id === tierId ? mutator(t) : t));
      const target = next.find((t) => t.id === tierId);
      if (target) scheduleSave(tierId, target);
      return next;
    });
  }

  function onTierPriceChange(tierId: number, currency: string, raw: string): void {
    updateLocal(tierId, (t) => ({
      ...t,
      priceInputs: { ...t.priceInputs, [currency]: raw },
    }));
  }

  function onTierOtherCurrencyChange(tierId: number, nextCurrency: string | null): void {
    updateLocal(tierId, (t) => {
      // Switching away clears the previous third-slot value so the server
      // never holds a stale entry for a currency the user can no longer see.
      const nextInputs = { ...t.priceInputs };
      if (t.otherCurrency && t.otherCurrency !== nextCurrency) {
        delete nextInputs[t.otherCurrency];
      }
      return { ...t, otherCurrency: nextCurrency, priceInputs: nextInputs };
    });
  }

  function onTierShareChange(tierId: number, raw: string): void {
    updateLocal(tierId, (t) => ({ ...t, shareInput: raw }));
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
      useToastStore
        .getState()
        .show("error", `Delete tier failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Empty-preset price input handler. Buffers local state and debounces a
   *  CREATE once at least one currency has a non-empty value. */
  function onEmptyPresetPriceChange(preset: PresetKey, currency: string, raw: string): void {
    setEmptySlots((prev) => ({
      ...prev,
      [preset]: {
        ...prev[preset],
        priceInputs: { ...prev[preset].priceInputs, [currency]: raw },
      },
    }));
    const existing = createTimers.current.get(preset);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      void maybeCreatePresetTier(preset);
    }, AUTOSAVE_MS);
    createTimers.current.set(preset, handle);
  }

  function onEmptyPresetOtherCurrencyChange(preset: PresetKey, next: string | null): void {
    setEmptySlots((prev) => {
      const slot = prev[preset];
      const nextInputs = { ...slot.priceInputs };
      if (slot.otherCurrency && slot.otherCurrency !== next) {
        delete nextInputs[slot.otherCurrency];
      }
      return {
        ...prev,
        [preset]: { ...slot, otherCurrency: next, priceInputs: nextInputs },
      };
    });
  }

  function onEmptyPresetShareChange(preset: PresetKey, raw: string): void {
    setEmptySlots((prev) => ({
      ...prev,
      [preset]: { ...prev[preset], shareInput: raw },
    }));
    const existing = createTimers.current.get(preset);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      void maybeCreatePresetTier(preset);
    }, AUTOSAVE_MS);
    createTimers.current.set(preset, handle);
  }

  async function maybeCreatePresetTier(preset: PresetKey): Promise<void> {
    const slot = emptySlotsRef.current[preset];
    if (!slot || slot.creating) return;
    const prices = inputsToPrices(slot.priceInputs, slot.otherCurrency);
    const share = parseShare(slot.shareInput);
    // Create the tier once the producer has set anything worth saving — a
    // price OR a share. (A share-only tier still won't map to NetEase without
    // a CNY price, but it's the producer's data to keep.)
    if (Object.keys(prices).length === 0 && share == null) return;
    setEmptySlots((prev) => ({
      ...prev,
      [preset]: { ...prev[preset], creating: true },
    }));
    try {
      const created = await api.create(trackId, {
        name: preset.toUpperCase(),
        deliverables: [preset],
        prices,
        share,
      });
      setTiers((prev) => [...prev, toDraft(created)]);
      setEmptySlots((prev) => ({
        ...prev,
        [preset]: { priceInputs: {}, otherCurrency: null, shareInput: "", creating: false },
      }));
    } catch (e) {
      // Reset the whole slot (incl. priceInputs + shareInput) so a failed
      // create can't leave a stuck value that re-fires the debounce on the
      // next keystroke.
      setEmptySlots((prev) => ({
        ...prev,
        [preset]: { priceInputs: {}, otherCurrency: null, shareInput: "", creating: false },
      }));
      useToastStore
        .getState()
        .show(
          "error",
          `Add ${preset.toUpperCase()} tier failed: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
  }

  function openPendingCustom(): void {
    if (pendingCustom) return;
    setPendingCustom({ name: "", priceInputs: {}, otherCurrency: null, shareInput: "" });
    setTimeout(() => pendingNameRef.current?.focus(), 0);
  }

  function cancelPendingCustom(): void {
    setPendingCustom(null);
  }

  function validateCustomName(rawName: string): string | null {
    const name = rawName.trim().toLowerCase();
    if (name === "") return "Tier name is required.";
    if (PRESET_KEYS.has(name))
      return `"${name.toUpperCase()}" is a preset — fill the row above instead.`;
    const dupe = tiers.find(
      (t) => t.deliverables.length === 1 && t.deliverables[0].toLowerCase() === name,
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
    const prices = inputsToPrices(pendingCustom.priceInputs, pendingCustom.otherCurrency);
    try {
      const created = await api.create(trackId, {
        name,
        deliverables: [deliverable],
        prices,
        share: parseShare(pendingCustom.shareInput),
      });
      setTiers((prev) => [...prev, toDraft(created)]);
      setPendingCustom(null);
    } catch (e) {
      useToastStore
        .getState()
        .show("error", `Add tier failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  void deliverablesKey; // reserved for future client-side dedup pre-flight

  return (
    <section data-license-tiers className="space-y-2">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary">
            License Tiers
          </h3>
          <label
            className="flex items-center gap-1.5 text-xs text-text-secondary"
            title="开启后 beat 名称带 [FREE] 前缀,NetEase 导出勾免费使用"
          >
            <input
              type="checkbox"
              aria-label="免费非商用授权 (FREE)"
              checked={free}
              onChange={(e) => void onToggleFree(e.target.checked)}
            />
            免费 (FREE)
          </label>
        </div>
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
                  onPriceChange={(c, v) => onTierPriceChange(tier.id, c, v)}
                  onOtherCurrencyChange={(c) => onTierOtherCurrencyChange(tier.id, c)}
                  onShareChange={(v) => onTierShareChange(tier.id, v)}
                  onDelete={() => void onDelete(tier.id)}
                />
              );
            }
            const empty = emptySlots[slot.key];
            return (
              <EmptyTierRow
                key={`preset-${slot.key}`}
                label={slot.label}
                priceInputs={empty.priceInputs}
                otherCurrency={empty.otherCurrency}
                shareInput={empty.shareInput}
                creating={empty.creating}
                onPriceChange={(c, v) => onEmptyPresetPriceChange(slot.key, c, v)}
                onOtherCurrencyChange={(c) => onEmptyPresetOtherCurrencyChange(slot.key, c)}
                onShareChange={(v) => onEmptyPresetShareChange(slot.key, v)}
              />
            );
          })}

          {categorized.customs.map((tier) => (
            <FilledTierRow
              key={`custom-${tier.id}`}
              label={tier.name.trim() || deriveAutoName(tier.deliverables)}
              tier={tier}
              onPriceChange={(c, v) => onTierPriceChange(tier.id, c, v)}
              onOtherCurrencyChange={(c) => onTierOtherCurrencyChange(tier.id, c)}
              onShareChange={(v) => onTierShareChange(tier.id, v)}
              onDelete={() => void onDelete(tier.id)}
            />
          ))}

          {categorized.legacy.map((tier) => (
            <FilledTierRow
              key={`legacy-${tier.id}`}
              label={deriveAutoName(tier.deliverables) || "(empty)"}
              tier={tier}
              onPriceChange={(c, v) => onTierPriceChange(tier.id, c, v)}
              onOtherCurrencyChange={(c) => onTierOtherCurrencyChange(tier.id, c)}
              onShareChange={(v) => onTierShareChange(tier.id, v)}
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

interface PriceTrioProps {
  priceInputs: Record<string, string>;
  otherCurrency: string | null;
  disabled?: boolean;
  /** When true, inputs use a transparent background to indicate the row is
   *  not yet persisted to the DB (matches the dashed empty-row styling). */
  ghost?: boolean;
  onPriceChange: (currency: string, raw: string) => void;
  onOtherCurrencyChange: (currency: string | null) => void;
}

function PriceTrio({
  priceInputs,
  otherCurrency,
  disabled = false,
  ghost = false,
  onPriceChange,
  onOtherCurrencyChange,
}: PriceTrioProps): React.JSX.Element {
  const inputBg = ghost ? "bg-transparent" : "bg-bg-base";
  const fxSource = pickFxSource(priceInputs, otherCurrency);
  return (
    <>
      {FIXED_CURRENCIES.map((code) => {
        const value = priceInputs[code] ?? "";
        const placeholder = value === "" ? fxPlaceholderFor(code, fxSource) : "—";
        return (
          <label
            key={code}
            className={`inline-flex items-center min-w-0 rounded-md border border-border-subtle ${inputBg} pl-2 pr-1 focus-within:border-accent`}
          >
            <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary shrink-0">
              {code}
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={value}
              onChange={(e) => onPriceChange(code, e.target.value)}
              disabled={disabled}
              placeholder={placeholder}
              className="w-20 min-w-0 bg-transparent px-2 py-1.5 text-sm tabular-nums placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
              aria-label={`${code} price`}
            />
          </label>
        );
      })}
      <div
        className={`inline-flex items-center min-w-0 rounded-md border border-border-subtle ${inputBg} focus-within:border-accent`}
      >
        <select
          value={otherCurrency ?? ""}
          onChange={(e) => onOtherCurrencyChange(e.target.value || null)}
          disabled={disabled}
          className="bg-transparent pl-2 pr-1 py-1.5 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary focus:outline-none disabled:opacity-50"
          aria-label="Third currency"
        >
          <option value="">—</option>
          {OTHER_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          step="0.01"
          value={otherCurrency ? (priceInputs[otherCurrency] ?? "") : ""}
          onChange={(e) => otherCurrency && onPriceChange(otherCurrency, e.target.value)}
          disabled={disabled || !otherCurrency}
          placeholder={
            otherCurrency && (priceInputs[otherCurrency] ?? "") === ""
              ? fxPlaceholderFor(otherCurrency, fxSource)
              : "—"
          }
          className="w-20 min-w-0 bg-transparent px-2 py-1.5 text-sm tabular-nums placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
          aria-label="Other currency price"
        />
      </div>
    </>
  );
}

interface FilledTierRowProps {
  label: string;
  tier: DraftTier;
  onPriceChange: (currency: string, raw: string) => void;
  onOtherCurrencyChange: (currency: string | null) => void;
  onShareChange: (raw: string) => void;
  onDelete: () => void;
}

function FilledTierRow({
  label,
  tier,
  onPriceChange,
  onOtherCurrencyChange,
  onShareChange,
  onDelete,
}: FilledTierRowProps): React.JSX.Element {
  return (
    <div
      data-license-tier
      data-tier-id={tier.id}
      className="group flex items-center gap-2 px-3 py-2 rounded-md border border-border-subtle bg-bg-elevated"
    >
      <span
        className={`${LABEL_WIDTH} shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary truncate`}
        title={label}
      >
        {label}
      </span>
      <PriceTrio
        priceInputs={tier.priceInputs}
        otherCurrency={tier.otherCurrency}
        onPriceChange={onPriceChange}
        onOtherCurrencyChange={onOtherCurrencyChange}
      />
      <label className="inline-flex items-center min-w-0 rounded-md border border-border-subtle bg-bg-base pl-2 pr-1 focus-within:border-accent">
        <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary shrink-0">
          %
        </span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={tier.shareInput}
          onChange={(e) => onShareChange(e.target.value)}
          placeholder="—"
          className="w-14 min-w-0 bg-transparent px-2 py-1.5 text-sm tabular-nums placeholder:text-text-tertiary focus:outline-none"
          aria-label="分成 %"
        />
      </label>
      <div className="flex-1" />
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
  priceInputs: Record<string, string>;
  otherCurrency: string | null;
  shareInput: string;
  creating: boolean;
  onPriceChange: (currency: string, raw: string) => void;
  onOtherCurrencyChange: (currency: string | null) => void;
  onShareChange: (raw: string) => void;
}

function EmptyTierRow({
  label,
  priceInputs,
  otherCurrency,
  shareInput,
  creating,
  onPriceChange,
  onOtherCurrencyChange,
  onShareChange,
}: EmptyTierRowProps): React.JSX.Element {
  return (
    <div
      data-license-tier
      data-empty="true"
      className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border-subtle"
    >
      <span
        className={`${LABEL_WIDTH} shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary truncate`}
      >
        {label}
      </span>
      <PriceTrio
        ghost
        priceInputs={priceInputs}
        otherCurrency={otherCurrency}
        disabled={creating}
        onPriceChange={onPriceChange}
        onOtherCurrencyChange={onOtherCurrencyChange}
      />
      <label className="inline-flex items-center min-w-0 rounded-md border border-dashed border-border-subtle bg-bg-base pl-2 pr-1 focus-within:border-accent">
        <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary shrink-0">
          %
        </span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={shareInput}
          disabled={creating}
          onChange={(e) => onShareChange(e.target.value)}
          placeholder="—"
          className="w-14 min-w-0 bg-transparent px-2 py-1.5 text-sm tabular-nums placeholder:text-text-tertiary focus:outline-none"
          aria-label="分成 %"
        />
      </label>
      <div className="flex-1" />
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
      className="flex items-center gap-2 px-3 py-2 rounded-md border border-accent/50 bg-bg-elevated"
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
      <PriceTrio
        priceInputs={value.priceInputs}
        otherCurrency={value.otherCurrency}
        onPriceChange={(currency, raw) =>
          onChange({
            priceInputs: { ...value.priceInputs, [currency]: raw },
          })
        }
        onOtherCurrencyChange={(c) => {
          const nextInputs = { ...value.priceInputs };
          if (value.otherCurrency && value.otherCurrency !== c) {
            delete nextInputs[value.otherCurrency];
          }
          onChange({ otherCurrency: c, priceInputs: nextInputs });
        }}
      />
      <label className="inline-flex items-center min-w-0 rounded-md border border-border-subtle bg-bg-base pl-2 pr-1 focus-within:border-accent">
        <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary shrink-0">
          %
        </span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={value.shareInput}
          onChange={(e) => onChange({ shareInput: e.target.value })}
          onKeyDown={onKeyDown}
          placeholder="—"
          className="w-14 min-w-0 bg-transparent px-2 py-1.5 text-sm tabular-nums placeholder:text-text-tertiary focus:outline-none"
          aria-label="分成 %"
        />
      </label>
      <div className="flex-1" />
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
