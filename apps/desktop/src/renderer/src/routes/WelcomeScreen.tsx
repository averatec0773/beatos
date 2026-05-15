import React, { useState } from "react";
import { Folder, Home } from "lucide-react";

import { useLibraryStore } from "@/stores/library";

export function WelcomeScreen(): React.JSX.Element {
  const init = useLibraryStore((s) => s.init);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onChooseFolder() {
    setError(null);
    setBusy(true);
    try {
      const picked = await window.beatos.openFolderDialog();
      if (!picked) {
        setBusy(false);
        return;
      }
      await init(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function onUseDefault() {
    setError(null);
    setBusy(true);
    try {
      const home = await window.beatos.getHomePath();
      await init(`${home}/BeatOS`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex items-center justify-center">
      <div className="max-w-md text-center space-y-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-2">
            Welcome to
          </div>
          <h1 className="text-5xl font-bold tracking-tight">BeatOS</h1>
          <p className="mt-3 text-text-secondary">
            The operating system for beat producers. Pick a folder to use as your library —
            BeatOS will keep your files where they are.
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <button
            onClick={onChooseFolder}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Folder size={16} />
            Choose Library Folder
          </button>
          <button
            onClick={onUseDefault}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-md border border-border-subtle text-text-primary hover:bg-bg-row-hover disabled:opacity-50"
          >
            <Home size={16} />
            Use default (~/BeatOS)
          </button>
        </div>

        {error && <div className="text-danger text-sm">{error}</div>}

        <div className="pt-4 text-xs text-text-tertiary">
          BeatOS catalogs your beats and metadata locally. No account, no telemetry, no
          upload — your library stays on your machine.
        </div>
      </div>
    </div>
  );
}
