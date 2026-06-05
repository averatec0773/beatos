import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  loadDefaultLicenseTiers,
  saveDefaultLicenseTiers,
  type DefaultLicenseTierTemplate,
} from "@/lib/default-license-tiers";
import { loadDefaultIsFree, saveDefaultIsFree } from "@/lib/default-free";
import { useToastStore } from "@/stores/toast";
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

/**
 * Default license tier templates applied to every newly-created track.
 * Mirrors the per-track LicenseTiersSection layout: three fixed preset
 * slots (MP3/WAV/STEMS) where the user types prices, plus optional custom
 * rows. Empty slots are not persisted — they simply mean "do not auto-add
 * this tier on new tracks."
 */

const SAVE_DEBOUNCE_MS = 600;

interface DraftRow {
  /** Tier name. For presets this is the preset label; for customs the user
   *  types it. Always uppercase by convention. */
  name: string;
  deliverable: string;
  /** Per-currency string-form input state. */
  priceInputs: Record<string, string>;
  otherCurrency: string | null;
  shareInput: string;
  /** Internal id used as a React key — not persisted. */
  uid: number;
}

function templateToDraft(t: DefaultLicenseTierTemplate, uid: number): DraftRow {
  const deliverable = (t.deliverables ?? [])[0]?.toLowerCase() ?? "";
  const priceInputs: Record<string, string> = {};
  for (const [code, amount] of Object.entries(t.prices ?? {})) {
    priceInputs[code] = String(amount);
  }
  let other: string | null = null;
  for (const code of Object.keys(t.prices ?? {})) {
    if (!FIXED_CURRENCY_SET.has(code)) {
      other = code;
      break;
    }
  }
  return {
    name: t.name?.trim() || deliverable.toUpperCase(),
    deliverable,
    priceInputs,
    otherCurrency: other,
    shareInput: t.share != null ? String(t.share) : "",
    uid,
  };
}

function draftToTemplate(d: DraftRow): DefaultLicenseTierTemplate | null {
  const prices = inputsToPrices(d.priceInputs, d.otherCurrency);
  if (Object.keys(prices).length === 0) return null;
  const shareStr = d.shareInput.trim();
  const shareNum = shareStr === "" ? null : Number(shareStr);
  return {
    name: d.name,
    deliverables: [d.deliverable],
    prices,
    share: shareNum != null && Number.isFinite(shareNum) ? shareNum : null,
  };
}

export function DefaultLicenseTiersSection(): React.JSX.Element {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<Record<PresetKey, DraftRow>>(() => ({
    mp3: {
      name: "MP3",
      deliverable: "mp3",
      priceInputs: {},
      otherCurrency: null,
      shareInput: "",
      uid: 1,
    },
    wav: {
      name: "WAV",
      deliverable: "wav",
      priceInputs: {},
      otherCurrency: null,
      shareInput: "",
      uid: 2,
    },
    stem: {
      name: "STEMS",
      deliverable: "stem",
      priceInputs: {},
      otherCurrency: null,
      shareInput: "",
      uid: 3,
    },
  }));
  const [customs, setCustoms] = useState<DraftRow[]>([]);
  const [defaultFree, setDefaultFree] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const uidCounter = React.useRef(10);

  useEffect(() => {
    void (async () => {
      const list = await loadDefaultLicenseTiers();
      const presetMap: Record<PresetKey, DraftRow> = {
        mp3: {
          name: "MP3",
          deliverable: "mp3",
          priceInputs: {},
          otherCurrency: null,
          shareInput: "",
          uid: 1,
        },
        wav: {
          name: "WAV",
          deliverable: "wav",
          priceInputs: {},
          otherCurrency: null,
          shareInput: "",
          uid: 2,
        },
        stem: {
          name: "STEMS",
          deliverable: "stem",
          priceInputs: {},
          otherCurrency: null,
          shareInput: "",
          uid: 3,
        },
      };
      const customList: DraftRow[] = [];
      for (const tpl of list) {
        const d = (tpl.deliverables ?? [])[0]?.toLowerCase() ?? "";
        if (PRESET_KEYS.has(d)) {
          presetMap[d as PresetKey] = templateToDraft(tpl, presetMap[d as PresetKey].uid);
        } else if (d !== "") {
          customList.push(templateToDraft(tpl, uidCounter.current++));
        }
      }
      setPresets(presetMap);
      setCustoms(customList);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    void loadDefaultIsFree().then(setDefaultFree);
  }, []);

  const scheduleSave = useCallback(
    (nextPresets: Record<PresetKey, DraftRow>, nextCustoms: DraftRow[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        try {
          const templates: DefaultLicenseTierTemplate[] = [];
          for (const slot of PRESET_SLOTS) {
            const tpl = draftToTemplate(nextPresets[slot.key]);
            if (tpl) templates.push(tpl);
          }
          for (const c of nextCustoms) {
            if (c.deliverable === "") continue;
            const tpl = draftToTemplate(c);
            if (tpl) templates.push(tpl);
          }
          await saveDefaultLicenseTiers(templates);
          setSavedAt(new Date());
        } catch (e) {
          useToastStore
            .getState()
            .show(
              "error",
              t("licenseTiers.saveFailed", {
                error: e instanceof Error ? e.message : String(e),
              }),
            );
        } finally {
          setSaving(false);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [t],
  );

  function updatePreset(preset: PresetKey, mutator: (row: DraftRow) => DraftRow): void {
    setPresets((prev) => {
      const next = { ...prev, [preset]: mutator(prev[preset]) };
      scheduleSave(next, customs);
      return next;
    });
  }

  function updateCustom(uid: number, mutator: (row: DraftRow) => DraftRow): void {
    setCustoms((prev) => {
      const next = prev.map((r) => (r.uid === uid ? mutator(r) : r));
      scheduleSave(presets, next);
      return next;
    });
  }

  function addCustom(): void {
    setCustoms((prev) => [
      ...prev,
      {
        name: "",
        deliverable: "",
        priceInputs: {},
        otherCurrency: null,
        shareInput: "",
        uid: uidCounter.current++,
      },
    ]);
  }

  function removeCustom(uid: number): void {
    setCustoms((prev) => {
      const next = prev.filter((r) => r.uid !== uid);
      scheduleSave(presets, next);
      return next;
    });
  }

  const status = useMemo(() => {
    if (loading) return t("common.loading");
    if (saving) return t("common.saving");
    if (savedAt) return t("licenseTiers.savedAt", { time: savedAt.toLocaleTimeString() });
    return "";
  }, [loading, saving, savedAt, t]);

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{t("licenseTiers.defaultTitle")}</h2>
        <span className="text-xs text-text-tertiary">{status}</span>
      </div>
      <p className="text-xs text-text-tertiary mb-3">{t("licenseTiers.defaultDesc")}</p>

      {loading ? (
        <div className="text-xs text-text-tertiary py-4">{t("common.loading")}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {PRESET_SLOTS.map((slot) => {
            const row = presets[slot.key];
            const filled =
              Object.keys(inputsToPrices(row.priceInputs, row.otherCurrency)).length > 0;
            return (
              <RowEditor
                key={slot.key}
                label={slot.label}
                row={row}
                emptyStyle={!filled}
                onPriceChange={(c, v) =>
                  updatePreset(slot.key, (r) => ({
                    ...r,
                    priceInputs: { ...r.priceInputs, [c]: v },
                  }))
                }
                onOtherCurrencyChange={(c) =>
                  updatePreset(slot.key, (r) => {
                    const next = { ...r.priceInputs };
                    if (r.otherCurrency && r.otherCurrency !== c) {
                      delete next[r.otherCurrency];
                    }
                    return { ...r, otherCurrency: c, priceInputs: next };
                  })
                }
                onShareChange={(v) => updatePreset(slot.key, (r) => ({ ...r, shareInput: v }))}
              />
            );
          })}

          {customs.map((row) => (
            <RowEditor
              key={row.uid}
              row={row}
              editableName
              onNameChange={(name) =>
                updateCustom(row.uid, (r) => ({
                  ...r,
                  name: name.toUpperCase(),
                  deliverable: name.trim().toLowerCase(),
                }))
              }
              onPriceChange={(c, v) =>
                updateCustom(row.uid, (r) => ({
                  ...r,
                  priceInputs: { ...r.priceInputs, [c]: v },
                }))
              }
              onOtherCurrencyChange={(c) =>
                updateCustom(row.uid, (r) => {
                  const next = { ...r.priceInputs };
                  if (r.otherCurrency && r.otherCurrency !== c) {
                    delete next[r.otherCurrency];
                  }
                  return { ...r, otherCurrency: c, priceInputs: next };
                })
              }
              onShareChange={(v) => updateCustom(row.uid, (r) => ({ ...r, shareInput: v }))}
              onDelete={() => removeCustom(row.uid)}
            />
          ))}

          <button
            type="button"
            onClick={addCustom}
            className="self-start inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border border-border-subtle hover:bg-bg-row-hover"
          >
            <Plus size={12} />
            {t("licenseTiers.addCustom")}
          </button>
        </div>
      )}
      <label className="flex items-center gap-2 mt-3 text-sm">
        <input
          type="checkbox"
          aria-label={t("licenseTiers.freeDefaultAria")}
          checked={defaultFree}
          onChange={(e) => {
            const v = e.target.checked;
            setDefaultFree(v);
            void saveDefaultIsFree(v);
          }}
        />
        {t("licenseTiers.freeDefaultLabel")}
      </label>
    </section>
  );
}

interface RowEditorProps {
  label?: string;
  row: DraftRow;
  emptyStyle?: boolean;
  editableName?: boolean;
  onNameChange?: (name: string) => void;
  onPriceChange: (currency: string, raw: string) => void;
  onOtherCurrencyChange: (currency: string | null) => void;
  onShareChange: (raw: string) => void;
  onDelete?: () => void;
}

function RowEditor({
  label,
  row,
  emptyStyle = false,
  editableName = false,
  onNameChange,
  onPriceChange,
  onOtherCurrencyChange,
  onShareChange,
  onDelete,
}: RowEditorProps): React.JSX.Element {
  const { t } = useTranslation();
  const borderClass = emptyStyle
    ? "border-dashed border-border-subtle"
    : "border-border-subtle bg-bg-elevated";
  const inputBg = emptyStyle ? "bg-transparent" : "bg-bg-base";
  const fxSource = pickFxSource(row.priceInputs, row.otherCurrency);
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md border ${borderClass}`}>
      {editableName ? (
        <input
          type="text"
          value={row.name}
          onChange={(e) => onNameChange?.(e.target.value)}
          placeholder={t("licenseTiers.tierNamePlaceholder")}
          className={`${LABEL_WIDTH} shrink-0 ${inputBg} border border-border-subtle rounded-md px-2 py-1 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-primary placeholder:text-text-tertiary placeholder:normal-case placeholder:tracking-normal placeholder:font-normal`}
          aria-label={t("licenseTiers.tierNameAria")}
        />
      ) : (
        <span
          className={`${LABEL_WIDTH} shrink-0 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary truncate`}
          title={label ?? ""}
        >
          {label}
        </span>
      )}

      {FIXED_CURRENCIES.map((code) => {
        const value = row.priceInputs[code] ?? "";
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
              placeholder={placeholder}
              className="w-20 min-w-0 bg-transparent px-2 py-1.5 text-sm tabular-nums placeholder:text-text-tertiary focus:outline-none"
              aria-label={t("licenseTiers.priceAria", { code })}
            />
          </label>
        );
      })}
      <div
        className={`inline-flex items-center min-w-0 rounded-md border border-border-subtle ${inputBg} focus-within:border-accent`}
      >
        <select
          value={row.otherCurrency ?? ""}
          onChange={(e) => onOtherCurrencyChange(e.target.value || null)}
          className="bg-transparent pl-2 pr-1 py-1.5 text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary focus:outline-none"
          aria-label={t("licenseTiers.thirdCurrencyAria")}
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
          value={row.otherCurrency ? (row.priceInputs[row.otherCurrency] ?? "") : ""}
          onChange={(e) => row.otherCurrency && onPriceChange(row.otherCurrency, e.target.value)}
          disabled={!row.otherCurrency}
          placeholder={
            row.otherCurrency && (row.priceInputs[row.otherCurrency] ?? "") === ""
              ? fxPlaceholderFor(row.otherCurrency, fxSource)
              : "—"
          }
          className="w-20 min-w-0 bg-transparent px-2 py-1.5 text-sm tabular-nums placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
          aria-label={t("licenseTiers.otherCurrencyPriceAria")}
        />
      </div>
      <label
        className={`inline-flex items-center min-w-0 rounded-md border border-border-subtle ${inputBg} pl-2 pr-1 focus-within:border-accent`}
      >
        <span className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary shrink-0">
          %
        </span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={row.shareInput}
          onChange={(e) => onShareChange(e.target.value)}
          placeholder="—"
          className="w-14 min-w-0 bg-transparent px-2 py-1.5 text-sm tabular-nums placeholder:text-text-tertiary focus:outline-none"
          aria-label={t("licenseTiers.shareAria")}
        />
      </label>
      <div className="flex-1" />
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="w-7 h-7 flex items-center justify-center rounded text-text-tertiary hover:text-danger hover:bg-bg-row-hover shrink-0"
          aria-label={t("licenseTiers.removeAria")}
          title={t("common.remove")}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
