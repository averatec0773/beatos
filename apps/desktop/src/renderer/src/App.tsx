import React, { useEffect, useState } from "react";

type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; payload: { status: string } }
  | { kind: "error"; message: string };

export default function App(): React.JSX.Element {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = await window.beatos.getApiBase();
        const res = await fetch(`${base}/api/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        if (!cancelled) setState({ kind: "ok", payload });
      } catch (err) {
        if (!cancelled)
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-sans flex items-center justify-center">
      <div className="text-center select-none">
        <div className="text-[11px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-2">
          BeatOS v0.0.1
        </div>
        {state.kind === "loading" && (
          <div className="text-2xl font-medium text-text-secondary">connecting…</div>
        )}
        {state.kind === "ok" && (
          <div className="text-5xl font-bold tracking-tight">{state.payload.status}</div>
        )}
        {state.kind === "error" && (
          <div className="text-2xl font-medium text-danger">{state.message}</div>
        )}
      </div>
    </div>
  );
}
