import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  trackTitle: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({
  open,
  trackTitle,
  onSave,
  onDiscard,
  onCancel,
}: Props): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel(); }}>
      <DialogContent data-unsaved-dialog onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            You&apos;ve changed &ldquo;{trackTitle}&rdquo; but haven&apos;t saved. Save now?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:justify-start">
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-2 rounded-md text-danger border border-danger/30 hover:bg-danger/10 text-sm font-medium"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2 rounded-md bg-accent text-white font-medium hover:opacity-90 text-sm"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
