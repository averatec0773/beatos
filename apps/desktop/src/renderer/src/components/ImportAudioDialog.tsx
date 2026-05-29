import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { AudioTag } from "@/lib/create-track-from-file";

export type ImportDestination = "new" | "attach";

interface Props {
  open: boolean;
  files: File[];
  attachCandidate: { id: number; title: string } | null;
  onCancel: () => void;
  onConfirm: (opts: { destination: ImportDestination; tag: AudioTag }) => void;
}

export function ImportAudioDialog({
  open,
  files,
  attachCandidate,
  onCancel,
  onConfirm,
}: Props): React.JSX.Element {
  const canAttach = files.length === 1 && attachCandidate != null;
  const [destination, setDestination] = useState<ImportDestination>("new");
  const [tag, setTag] = useState<AudioTag>("untagged");

  useEffect(() => {
    if (open) {
      // Default to "new" even when attach is possible: "attach" replaces an
      // existing asset, so it should be an explicit user choice, never the
      // one-click default.
      setDestination("new");
      setTag("untagged");
    }
  }, [open]);

  const count = files.length;
  const title =
    count === 1 ? `Import "${files[0]?.name ?? "audio"}"` : `Import ${count} audio files`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset>
            <legend className="text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-2">
              Where
            </legend>
            <label className="flex items-center gap-2 text-sm text-text-primary py-1 cursor-pointer">
              <input
                type="radio"
                name="import-destination"
                value="new"
                checked={destination === "new"}
                onChange={() => setDestination("new")}
                className="accent-accent"
              />
              <span>Create {count > 1 ? `${count} new tracks` : "new track"}</span>
            </label>
            <label
              className={[
                "flex items-center gap-2 text-sm py-1",
                canAttach
                  ? "text-text-primary cursor-pointer"
                  : "text-text-tertiary cursor-not-allowed",
              ].join(" ")}
            >
              <input
                type="radio"
                name="import-destination"
                value="attach"
                checked={destination === "attach"}
                onChange={() => canAttach && setDestination("attach")}
                disabled={!canAttach}
                className="accent-accent"
              />
              <span>
                {canAttach
                  ? `Attach to "${attachCandidate!.title}" (replaces existing role)`
                  : count > 1
                    ? "Attach to selected — pick one file at a time"
                    : "Attach to selected — no track focused"}
              </span>
            </label>
          </fieldset>

          <fieldset>
            <legend className="text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-2">
              Role
            </legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                <input
                  type="radio"
                  name="import-tag"
                  value="tagged"
                  checked={tag === "tagged"}
                  onChange={() => setTag("tagged")}
                  className="accent-accent"
                />
                <span>Tagged</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
                <input
                  type="radio"
                  name="import-tag"
                  value="untagged"
                  checked={tag === "untagged"}
                  onChange={() => setTag("untagged")}
                  className="accent-accent"
                />
                <span>Untagged</span>
              </label>
            </div>
          </fieldset>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md border border-border-subtle text-sm hover:bg-bg-row-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ destination, tag })}
            className="px-4 py-2 rounded-md bg-accent text-white text-sm hover:opacity-90"
          >
            Import
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
