import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { TagSuggestion } from "@/api/ai";

export interface SuggestTagsPatch {
  genre?: string[];
  mood?: string[];
  tags?: string[];
  description?: string;
}

interface Props {
  open: boolean;
  suggestion: TagSuggestion | null;
  onApply: (patch: SuggestTagsPatch) => void;
  onClose: () => void;
}

export function SuggestTagsDialog({
  open,
  suggestion,
  onApply,
  onClose,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Default each field checked when the model returned something for it.
  useEffect(() => {
    if (!open || !suggestion) return;
    setChecked({
      genre: suggestion.genre.length > 0,
      mood: suggestion.mood.length > 0,
      tags: suggestion.tags.length > 0,
      description: !!suggestion.description,
    });
  }, [open, suggestion]);

  function toggle(key: string): void {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function apply(): void {
    if (!suggestion) return;
    const patch: SuggestTagsPatch = {};
    if (checked.genre && suggestion.genre.length) patch.genre = suggestion.genre;
    if (checked.mood && suggestion.mood.length) patch.mood = suggestion.mood;
    if (checked.tags && suggestion.tags.length) patch.tags = suggestion.tags;
    if (checked.description && suggestion.description) patch.description = suggestion.description;
    onApply(patch);
    onClose();
  }

  type Row = { key: "genre" | "mood" | "tags"; label: string; values: string[] };
  const allRows: Row[] = suggestion
    ? [
        { key: "genre", label: t("dialogs.suggestTags.genre"), values: suggestion.genre },
        { key: "mood", label: t("dialogs.suggestTags.mood"), values: suggestion.mood },
        { key: "tags", label: t("dialogs.suggestTags.tags"), values: suggestion.tags },
      ]
    : [];
  const listRows = allRows.filter((r) => r.values.length > 0);
  const hasAny =
    listRows.length > 0 ||
    !!(suggestion && suggestion.description && suggestion.description.trim());
  const nothingChecked = !Object.values(checked).some(Boolean);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogs.suggestTags.title")}</DialogTitle>
          <DialogDescription>{t("dialogs.suggestTags.desc")}</DialogDescription>
        </DialogHeader>

        {!hasAny ? (
          <p className="text-sm text-text-tertiary py-2">{t("dialogs.suggestTags.empty")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {listRows.map((row) => (
              <label key={row.key} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!checked[row.key]}
                  onChange={() => toggle(row.key)}
                  className="mt-1 accent-accent"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs text-text-secondary">{row.label}</span>
                  <span className="flex flex-wrap gap-1">
                    {row.values.map((v) => (
                      <span
                        key={v}
                        className="inline-flex items-center rounded-full bg-bg-elevated px-2 py-0.5 text-xs text-text-primary"
                      >
                        {v}
                      </span>
                    ))}
                  </span>
                </span>
              </label>
            ))}
            {suggestion?.description && suggestion.description.trim() && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!checked.description}
                  onChange={() => toggle("description")}
                  className="mt-1 accent-accent"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs text-text-secondary">
                    {t("dialogs.suggestTags.description")}
                  </span>
                  <span className="text-sm text-text-primary">{suggestion.description}</span>
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter className="mt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={!hasAny || nothingChecked}
            onClick={apply}
            className="rounded-md px-3 py-1.5 text-sm disabled:opacity-50 btn-primary"
          >
            {t("dialogs.suggestTags.apply")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
