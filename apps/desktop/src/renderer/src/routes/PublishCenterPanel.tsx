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

export function PublishCenterPanel(): React.JSX.Element {
  const navigate = useNavigate();
  const sessions = usePublishCenterStore((s) => s.sessions);
  const jobs = usePublishCenterStore((s) => s.jobs);
  const validating = usePublishCenterStore((s) => s.validating);
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
            await validateSessions();
            useToastStore.getState().show("success", "登录成功");
          } else if (status === "failed" || status === "timeout") {
            stopLogin();
            useToastStore
              .getState()
              .show("error", `登录${status === "timeout" ? "超时" : "失败"}：${message}`);
          }
        } catch {
          /* transient; keep polling */
        }
      }, 2000);
    } catch {
      setLoginPlatform(null);
      useToastStore.getState().show("error", "无法开始登录");
    }
  }

  const platforms = useMemo(() => Object.keys(sessions), [sessions]);

  return (
    <div className="beatos-card beatos-scroll h-full overflow-y-auto rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">发布中心</h1>
        <button
          type="button"
          onClick={() => void validateSessions()}
          disabled={validating}
          className="flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-row-hover disabled:opacity-50"
        >
          <RefreshCw size={13} className={validating ? "animate-spin" : ""} /> 刷新状态
        </button>
      </div>

      <div className={`${SECTION} mb-2`}>账号会话</div>
      <div className="mb-6 flex flex-col gap-1.5">
        {platforms.length === 0 ? (
          <div className="text-xs text-text-tertiary">暂无平台</div>
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

      <div className={`${SECTION} mb-2`}>实时任务</div>
      <div className="flex flex-col gap-1.5">
        {jobs.length === 0 ? (
          <div className="text-xs text-text-tertiary">当前没有进行中的发布</div>
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
