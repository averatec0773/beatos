import React from "react";
import { useTranslation } from "react-i18next";

import { useConfirmStore } from "@/stores/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Single mounted host for the styled, promise-based confirm (see
 * `confirmDialog()` in stores/confirm-dialog). Replaces native `confirm()` so
 * confirmations match the rest of the UI: same glass shell, same footer order
 * (Cancel left · primary right), danger variant for destructive actions.
 */
export function ConfirmDialog(): React.JSX.Element {
  const { t } = useTranslation();
  const current = useConfirmStore((s) => s.current);
  const respond = useConfirmStore((s) => s.respond);

  return (
    <Dialog
      open={current != null}
      onOpenChange={(open) => {
        if (!open) respond(false);
      }}
    >
      {/* With a message, <DialogDescription> auto-registers itself with Radix.
          Without one, explicitly opt out (aria-describedby={undefined}) to
          silence Radix's "missing Description" warning (e.g. the bulk-trash
          "Move N tracks to trash?" confirm carries no message). */}
      <DialogContent
        className="max-w-sm"
        {...(current?.message ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader>
          <DialogTitle>{current?.title}</DialogTitle>
          {current?.message && <DialogDescription>{current.message}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => respond(false)}>
            {current?.cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant={current?.variant === "danger" ? "danger" : "default"}
            onClick={() => respond(true)}
            autoFocus
          >
            {current?.confirmLabel ?? t("common.ok")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
