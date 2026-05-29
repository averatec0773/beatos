import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChipMultiSelect } from "@/components/ChipMultiSelect";
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
  return (
    <div className="flex gap-1 text-xs">
      {(["add", "replace", "remove"] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded px-2 py-0.5 ${value === m ? "bg-accent/20 text-text-primary" : "text-text-tertiary"}`}
        >
          {m === "add" ? "追加" : m === "replace" ? "覆盖" : "移除"}
        </button>
      ))}
    </div>
  );
}

export function BulkEditDialog({ open, ids, onClose, onDone }: Props) {
  const [genre, setGenre] = useState<FieldState>(EMPTY);
  const [mood, setMood] = useState<FieldState>(EMPTY);
  const [producer, setProducer] = useState<FieldState>(EMPTY);
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
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const r = await bulk.update(ids, patch);
      useToastStore.getState().show("success", `已更新 ${r.updated_count} 首`);
      await useTrackStore.getState().refresh();
      onDone();
    } catch {
      useToastStore.getState().show("error", "批量编辑失败");
    } finally {
      setBusy(false);
    }
  };

  const applyLicense = async () => {
    setBusy(true);
    try {
      const r = await bulk.applyLicenseTemplate(ids);
      useToastStore.getState().show("success", `已套用 license 到 ${r.applied} 首`);
      await useTrackStore.getState().refresh();
      onDone();
    } catch {
      useToastStore
        .getState()
        .show("error", "套用 license 模板失败（是否已在 Settings 配置默认 tiers？）");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>批量编辑 {ids.length} 首</DialogTitle>
          <DialogDescription>留空的字段不会改动。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Genre</span>
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
              placeholder="Add genre..."
              popoverTitle="Genres"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Mood</span>
              <ModeToggle
                value={mood.mode}
                onChange={(mode) => setMood((s) => ({ ...s, mode }))}
              />
            </div>
            <ChipMultiSelect
              value={mood.values}
              options={BEATOS_MOODS.map((m) => ({
                value: m.en,
                label: formatVocabLabel(m.en, "mood", vocabLocale),
                group: m.group,
              }))}
              onChange={(v) => setMood((s) => ({ ...s, values: v }))}
              placeholder="Add mood..."
              popoverTitle="Moods"
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-secondary">Producer</span>
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
              placeholder="Add producer..."
              popoverTitle="Producers"
            />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void applyLicense()}
            className="self-start rounded-md border border-border-subtle px-3 py-1.5 text-xs hover:bg-bg-row-hover disabled:opacity-50"
          >
            套用默认 license tiers
          </button>
        </div>
        <DialogFooter className="mt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm">
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void apply()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            应用到 {ids.length} 首
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
