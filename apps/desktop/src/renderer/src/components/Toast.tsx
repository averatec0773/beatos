import React from "react";
import { X } from "lucide-react";

import { useToastStore } from "@/stores/toast";

const VARIANT_CLASSES: Record<string, string> = {
  info: "border-zinc-700 bg-zinc-900 text-zinc-100",
  success: "border-emerald-700 bg-emerald-950 text-emerald-100",
  warning: "border-amber-700 bg-amber-950 text-amber-100",
  error: "border-red-700 bg-red-950 text-red-100",
};

export function Toast(): React.JSX.Element | null {
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
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
