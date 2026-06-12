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
      <DialogContent className="max-w-sm">
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
