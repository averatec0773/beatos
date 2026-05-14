import React, { useEffect, useState } from "react";

import { useLibraryStore } from "@/stores/library";

export function OnboardingDriver(): React.JSX.Element {
  const init = useLibraryStore((s) => s.init);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const picked = await window.beatos.openFolderDialog();
        if (cancelled) return;
        if (!picked) {
          await window.beatos.quitApp();
          return;
        }
        await init(picked);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [init]);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex items-center justify-center">
      {error ? (
        <div className="text-danger">{error}</div>
      ) : (
        <div className="text-text-secondary">Choose a library folder to get started…</div>
      )}
    </div>
  );
}
