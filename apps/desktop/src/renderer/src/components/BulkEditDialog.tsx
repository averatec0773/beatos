import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChipMultiSelect } from "@/components/ChipMultiSelect";
import { KeyPicker } from "@/components/KeyPicker";
import { BEATOS_GENRES } from "@/data/genres";
import { BEATOS_MOODS } from "@/data/moods";
import { formatVocabLabel } from "@/data/vocab-label";
import { useVocabLocaleStore } from "@/stores/vocab-locale";
import { bulk } from "@/api/bulk";
import { useToastStore } from "@/stores/toast";
import { useTrackStore } from "@/stores/tracks";

type Mode = "add" | "replace" | "remove";

interface Props {
  open: boolean;
  ids: number[];
  onClose: () => void;
  onDone: () => void;
}

interface FieldState {
  values: string[];
  mode: Mode;
}

const EMPTY: FieldState = { values: [], mode: "add" };

function specFor(f: FieldState): unknown | null {
  if (f.values.length === 0) return null;
  if (f.mode === "replace") return f.values;
  if (f.mode === "add") return { add: f.values };
  return { remove: f.values };
}

function ModeToggle({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1 text-xs">
      {(["add", "replace", "remove"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded px-2 py-0.5 ${value === m ? "bg-accent/20 text-text-primary" : "text-text-tertiary"}`}
        >
          {m === "add"
            ? t("dialogs.bulkEdit.modeAdd")
            : m === "replace"
              ? t("dialogs.bulkEdit.modeReplace")
              : t("dialogs.bulkEdit.modeRemove")}
        </button>
      ))}
    </div>
  );
}

export function BulkEditDialog({ open, ids, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [genre, setGenre] = useState<FieldState>(EMPTY);
  const [mood, setMood] = useState<FieldState>(EMPTY);
  const [producer, setProducer] = useState<FieldState>(EMPTY);
  const [bpm, setBpm] = useState("");
  const [keySig, setKeySig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const vocabLocale = useVocabLocaleStore((s) => s.locale);

  const apply = async () => {
    const patch: Record<string, unknown> = {};
    const g = specFor(genre);
    const m = specFor(mood);
    const p = specFor(producer);
    if (g) patch.genre = g;
    if (m) patch.mood = m;
    if (p) patch.producer = p;
    // Scalar fields: only included when set; an empty input leaves the value
    // unchanged on every selected track (mirrors the "Empty fields are left
    // unchanged" contract). Invalid BPM text is ignored rather than sent.
    const bpmTrim = bpm.trim();
    if (bpmTrim !== "") {
      const n = Number(bpmTrim);
      if (Number.isInteger(n) && n > 0) patch.bpm = n;
    }
    if (keySig) patch.key = keySig;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const r = await bulk.update(ids, patch);
      useToastStore
        .getState()
        .show("success", t("dialogs.bulkEdit.updated", { count: r.updated_count }));
      await useTrackStore.getState().refresh();
      onDone();
    } catch {
      useToastStore.getState().show("error", t("dialogs.bulkEdit.failed"));
    } finally {
      setBusy(false);
    }
  };

  const applyLicense = async () => {
    setBusy(true);
    try {
      const r = await bulk.applyLicenseTemplate(ids);
      useToastStore
        .getState()
        .show("success", t("dialogs.bulkEdit.licenseApplied", { count: r.applied }));
      await useTrackStore.getState().refresh();
      onDone();
    } catch {
      useToastStore.getState().show("error", t("dialogs.bulkEdit.licenseFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogs.bulkEdit.title", { count: ids.length })}</DialogTitle>
          <DialogDescription>{t("dialogs.bulkEdit.desc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">{t("editor.genre")}</span>
              <ModeToggle
                value={genre.mode}
                onChange={(mode) => setGenre((s) => ({ ...s, mode }))}
              />
            </div>
            <ChipMultiSelect
              value={genre.values}
              options={BEATOS_GENRES.map((g) => ({
                value: g.en,
                label: formatVocabLabel(g.en, "genre", vocabLocale),
              }))}
              onChange={(v) => setGenre((s) => ({ ...s, values: v }))}
              placeholder={t("editor.addGenre")}
              popoverTitle={t("editor.genres")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">{t("editor.mood")}</span>
              <ModeToggle value={mood.mode} onChange={(mode) => setMood((s) => ({ ...s, mode }))} />
            </div>
            <ChipMultiSelect
              value={mood.values}
              options={BEATOS_MOODS.map((m) => ({
                value: m.en,
                label: formatVocabLabel(m.en, "mood", vocabLocale),
                group: m.group,
              }))}
              onChange={(v) => setMood((s) => ({ ...s, values: v }))}
              placeholder={t("editor.addMood")}
              popoverTitle={t("editor.moods")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">{t("editor.producer")}</span>
              <ModeToggle
                value={producer.mode}
                onChange={(mode) => setProducer((s) => ({ ...s, mode }))}
              />
            </div>
            <ChipMultiSelect
              value={producer.values}
              options={producer.values.map((v) => ({ value: v, label: v }))}
              onChange={(v) => setProducer((s) => ({ ...s, values: v }))}
              allowCustomAdd
              placeholder={t("editor.addProducer")}
              popoverTitle={t("editor.producers")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">{t("tableHeader.bpm")}</span>
            <input
              type="number"
              min={1}
              step={1}
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              placeholder={t("dialogs.bulkEdit.bpmPlaceholder")}
              className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2 text-text-primary focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">{t("tableHeader.key")}</span>
            <KeyPicker value={keySig} onChange={setKeySig} />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void applyLicense()}
            className="self-start rounded-md border border-border-subtle px-3 py-1.5 text-xs hover:bg-bg-row-hover disabled:opacity-50"
          >
            {t("dialogs.bulkEdit.applyDefaultTiers")}
          </button>
        </div>
        <DialogFooter className="mt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply()}
            className="rounded-md px-3 py-1.5 text-sm disabled:opacity-50 btn-primary"
          >
            {t("dialogs.bulkEdit.apply", { count: ids.length })}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
