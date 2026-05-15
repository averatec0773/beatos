import React, { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWatcherStore } from "@/stores/watcher";
import { useTrackStore } from "@/stores/tracks";

export function FirstScanModal(): React.JSX.Element | null {
  const pending = useWatcherStore((s) => s.pendingScan);
  const resolveScan = useWatcherStore((s) => s.resolveScan);
  const refreshTracks = useTrackStore((s) => s.refresh);
  const [busy, setBusy] = useState(false);

  if (!pending) return null;

  async function onImportAll() {
    setBusy(true);
    await resolveScan("import_all");
    await refreshTracks();
    setBusy(false);
  }

  async function onSkip() {
    setBusy(true);
    await resolveScan("skip");
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={() => { /* prevent close-on-outside-click */ }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Found {pending.found_files.length} audio file{pending.found_files.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            What would you like to do with the existing files in this folder?
            BeatOS will keep watching for new exports either way.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-48 overflow-y-auto text-sm text-text-secondary space-y-1 my-2 border border-border-subtle rounded-md p-2">
          {pending.found_files.slice(0, 10).map((f) => (
            <div key={f.path} className="flex items-center gap-2 text-xs">
              <span className="flex-1 truncate" title={f.path}>{f.path.split("/").pop()}</span>
              {f.bpm && <span className="font-mono">{f.bpm} BPM</span>}
              {f.duration_seconds && (
                <span className="font-mono text-text-tertiary">
                  {Math.floor(f.duration_seconds / 60)}:{String(Math.floor(f.duration_seconds % 60)).padStart(2, "0")}
                </span>
              )}
            </div>
          ))}
          {pending.found_files.length > 10 && (
            <div className="text-xs text-text-tertiary italic">…and {pending.found_files.length - 10} more</div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <button
            onClick={onImportAll}
            disabled={busy}
            className="w-full px-4 py-2 rounded-md bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            Import all as drafts
          </button>
          <button
            onClick={onSkip}
            disabled={busy}
            className="w-full px-4 py-2 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover disabled:opacity-50"
          >
            Skip — only watch new files
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
