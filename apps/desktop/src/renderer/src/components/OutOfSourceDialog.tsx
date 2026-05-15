import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import type { Source } from "@/api/sources";

type Mode = "copy" | "move" | "add_as_source";

interface Props {
  open: boolean;
  filePath: string;
  availableSources: Source[];
  onCancel: () => void;
  onCopy: (args: { sourceId: number; subfolder: string }) => void;
  onMove: (args: { sourceId: number; subfolder: string }) => void;
  onAddAsSource: () => void;
}

export function OutOfSourceDialog({
  open, filePath, availableSources, onCancel, onCopy, onMove, onAddAsSource,
}: Props): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("copy");
  const [sourceId, setSourceId] = useState<number>(
    availableSources[0]?.id ?? 0
  );
  const [subfolder, setSubfolder] = useState<string>("");

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (mode === "copy") onCopy({ sourceId, subfolder });
    else if (mode === "move") onMove({ sourceId, subfolder });
    else onAddAsSource();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>This file isn't in any Source</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <code className="block text-xs text-text-tertiary truncate">{filePath}</code>

          <div className="space-y-2">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                checked={mode === "copy"}
                onChange={() => setMode("copy")}
              />
              <div>
                <div className="font-medium">Copy into Source</div>
                <div className="text-xs text-text-tertiary">Original file stays untouched.</div>
              </div>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                checked={mode === "move"}
                onChange={() => setMode("move")}
              />
              <div>
                <div className="font-medium">Move into Source</div>
                <div className="text-xs text-text-tertiary">File is moved from original location.</div>
              </div>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="radio"
                checked={mode === "add_as_source"}
                onChange={() => setMode("add_as_source")}
              />
              <div>
                <div className="font-medium">
                  Add containing folder as a Source
                </div>
                <div className="text-xs text-text-tertiary">
                  Suitable if you have a permanent home for these files.
                </div>
              </div>
            </label>
          </div>

          {(mode === "copy" || mode === "move") && (
            <>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1">
                  Destination Source
                </label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(Number(e.target.value))}
                  className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2"
                >
                  {availableSources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.root_path})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1">
                  Subfolder (optional)
                </label>
                <input
                  type="text"
                  value={subfolder}
                  onChange={(e) => setSubfolder(e.target.value)}
                  placeholder="_inbox"
                  className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-2"
                />
              </div>
            </>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-md border border-border-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-accent text-white font-medium"
            >
              Continue
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
