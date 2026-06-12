import React from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useToastStore } from "@/stores/toast";

// On-brand: every toast sits on the opaque elevated surface; the variant is
// carried by the border colour (semantic tokens), not a tinted background.
const VARIANT_CLASSES: Record<string, string> = {
  info: "border-border-subtle bg-bg-elevated text-text-primary",
  success: "border-success bg-bg-elevated text-text-primary",
  warning: "border-warning bg-bg-elevated text-text-primary",
  error: "border-danger bg-bg-elevated text-text-primary",
};

export function Toast(): React.JSX.Element | null {
  const { t } = useTranslation();
  const current = useToastStore((s) => s.current);
  if (!current) return null;
  const classes = VARIANT_CLASSES[current.variant] ?? VARIANT_CLASSES.info;
  return (
    <div
      data-toast
      data-variant={current.variant}
      role="status"
      className={`fixed bottom-24 right-6 z-[60] min-w-[280px] max-w-md rounded-md border px-4 py-3 shadow-lg ${classes}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm leading-snug">{current.message}</div>
        <button
          type="button"
          onClick={() => useToastStore.getState().dismiss()}
          className="text-zinc-400 hover:text-zinc-100"
          aria-label={t("common.dismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
