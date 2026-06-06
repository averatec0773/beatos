import { useState } from "react";
import { Plus } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useTranslation } from "react-i18next";

import { KeyPickerPopover } from "./KeyPickerPopover";

interface Props {
  value: string | null;
  onChange: (next: string | null) => void;
}

export function KeyPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          data-key-picker-trigger
          className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2 text-left text-text-primary hover:border-text-tertiary focus:outline-none focus:border-accent"
        >
          {value ? (
            <span>{value}</span>
          ) : (
            <span className="flex items-center gap-1 text-text-tertiary">
              <Plus size={14} />
              <span>{t("keyPicker.add")}</span>
            </span>
          )}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content sideOffset={6} className="z-50">
          <KeyPickerPopover
            initialValue={value}
            onCommit={(v) => onChange(v)}
            onClear={() => onChange(null)}
            onClose={() => setOpen(false)}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
