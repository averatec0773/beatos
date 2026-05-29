import React, { useEffect, useState } from "react";

export function SidecarCrashToast(): React.JSX.Element | null {
  const [info, setInfo] = useState<{ code: number | null; signal: string | null } | null>(null);

  useEffect(() => {
    return window.beatos.onSidecarCrashed((i) => setInfo(i));
  }, []);

  if (!info) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-danger bg-bg-elevated p-3 shadow-lg">
      <div className="text-sm font-semibold text-danger">Backend disconnected</div>
      <div className="mt-1 text-xs text-text-secondary">
        The sidecar process exited (code {String(info.code)}, signal {String(info.signal)}). Restart
        the app to reconnect.
      </div>
      <button
        onClick={() => setInfo(null)}
        className="mt-2 text-xs text-text-tertiary hover:text-text-primary"
      >
        Dismiss
      </button>
    </div>
  );
}
