import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { publishApi } from "@/api/publish";
import { usePublishCenterStore } from "@/stores/publish-center";
import { useTrackStore } from "@/stores/tracks";
import { useToastStore } from "@/stores/toast";
import { SessionHealthRow } from "@/components/PublishCenter/SessionHealthRow";
import { LiveJobRow } from "@/components/PublishCenter/LiveJobRow";

const SECTION = "text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary";

function checkedAgoLabel(validatedAt: Record<string, number>): string {
  const ts = Math.max(0, ...Object.values(validatedAt));
  if (!ts) return "Never checked";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "Checked just now";
  if (mins < 60) return `Checked ${mins}m ago`;
  return `Checked ${Math.floor(mins / 60)}h ago`;
}

export function PublishCenterPanel(): React.JSX.Element {
  const navigate = useNavigate();
  const sessions = usePublishCenterStore((s) => s.sessions);
  const jobs = usePublishCenterStore((s) => s.jobs);
  const validating = usePublishCenterStore((s) => s.validating);
  const validatedAt = usePublishCenterStore((s) => s.validatedAt);
  const loadSessions = usePublishCenterStore((s) => s.loadSessions);
  const validateSessions = usePublishCenterStore((s) => s.validateSessions);
  const refreshJobs = usePublishCenterStore((s) => s.refreshJobs);

  // VERIFY A: track store uses `list`, not `tracks`
  const trackList = useTrackStore((s) => s.list);
  const titleFor = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of trackList) map.set(t.id, t.title);
    return (id: number) => map.get(id) ?? `Track #${id}`;
  }, [trackList]);

  const [loginPlatform, setLoginPlatform] = useState<string | null>(null);
  const jobsTimer = useRef<number | null>(null);
  const loginTimer = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    void (async () => {
      await loadSessions();
      await validateSessions();
    })();
    void refreshJobs();
    jobsTimer.current = window.setInterval(() => void refreshJobs(), 2000);
    return () => {
      if (jobsTimer.current) window.clearInterval(jobsTimer.current);
      if (loginTimer.current) window.clearInterval(loginTimer.current);
    };
  }, [loadSessions, validateSessions, refreshJobs]);

  useEffect(() => () => { mountedRef.current = false; }, []);

  function stopLogin(): void {
    if (loginTimer.current) window.clearInterval(loginTimer.current);
    loginTimer.current = null;
    setLoginPlatform(null);
  }

  async function handleLogin(platform: string): Promise<void> {
    if (loginTimer.current) {
      window.clearInterval(loginTimer.current);
      loginTimer.current = null;
    }
    setLoginPlatform(platform);
    try {
      const { login_id } = await publishApi.login(platform);
      if (!mountedRef.current) return;
      loginTimer.current = window.setInterval(async () => {
        try {
          const { status, message } = await publishApi.loginStatus(login_id);
          if (status === "success") {
            stopLogin();
            await validateSessions(true);
            useToastStore.getState().show("success", "Logged in");
          } else if (status === "failed" || status === "timeout") {
            stopLogin();
            useToastStore
              .getState()
              .show("error", `Login ${status === "timeout" ? "timed out" : "failed"}: ${message}`);
          }
        } catch {
          /* transient; keep polling */
        }
      }, 2000);
    } catch {
      setLoginPlatform(null);
      useToastStore.getState().show("error", "Couldn't start login");
    }
  }

  const platforms = useMemo(() => Object.keys(sessions), [sessions]);

  return (
    <div className="beatos-card beatos-scroll h-full overflow-y-auto rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Publish Center</h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-tertiary">{checkedAgoLabel(validatedAt)}</span>
          <button
            type="button"
            onClick={() => void validateSessions(true)}
            disabled={validating}
            className="flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-row-hover disabled:opacity-50"
          >
            <RefreshCw size={13} className={validating ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      <div className={`${SECTION} mb-2`}>Account sessions</div>
      <div className="mb-6 flex flex-col gap-1.5">
        {platforms.length === 0 ? (
          <div className="text-xs text-text-tertiary">No platforms</div>
        ) : (
          platforms.map((p) => (
            <SessionHealthRow
              key={p}
              platform={p}
              state={sessions[p]}
              loggingIn={loginPlatform === p}
              onLogin={() => void handleLogin(p)}
            />
          ))
        )}
      </div>

      <div className={`${SECTION} mb-2`}>Activity</div>
      <div className="flex flex-col gap-1.5">
        {jobs.length === 0 ? (
          <div className="text-xs text-text-tertiary">No publishes in progress</div>
        ) : (
          jobs.map((j) => (
            <LiveJobRow
              key={j.job_id}
              job={j}
              title={titleFor(j.request.track_id)}
              onRepublish={(id) => navigate(`/tracks/${id}/edit`)}
            />
          ))
        )}
      </div>
    </div>
  );
}
