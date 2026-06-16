import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";

import { publishApi } from "@/api/publish";
import { usePublishCenterStore } from "@/stores/publish-center";
import { useTrackStore } from "@/stores/tracks";
import { useToastStore } from "@/stores/toast";
import { SessionHealthRow } from "@/components/PublishCenter/SessionHealthRow";
import { LiveJobRow } from "@/components/PublishCenter/LiveJobRow";
import { PublishTrackPicker } from "@/components/PublishCenter/PublishTrackPicker";
import { PublishDialog } from "@/components/PublishDialog";

const SECTION = "text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary";

// A job still moving (anything but a terminal done/failed) wants the fast 2s poll;
// once everything is settled we back off so an idle, mounted panel isn't hitting the
// sidecar 30×/min forever — we still poll slowly to pick up a newly-started publish.
const POLL_ACTIVE_MS = 2000;
const POLL_IDLE_MS = 8000;

export function PublishCenterPanel(): React.JSX.Element {
  const { t } = useTranslation();
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
    for (const track of trackList) map.set(track.id, track.title);
    return (id: number) => map.get(id) ?? t("publishCenter.trackFallback", { id });
  }, [trackList, t]);

  const [loginPlatform, setLoginPlatform] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [publishTrackId, setPublishTrackId] = useState<number | null>(null);
  const jobsTimer = useRef<number | null>(null);
  const loginTimer = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    void (async () => {
      await loadSessions();
      await validateSessions();
    })();
    let cancelled = false;
    const tick = async (): Promise<void> => {
      if (cancelled) return;
      await refreshJobs();
      if (cancelled) return;
      const active = usePublishCenterStore
        .getState()
        .jobs.some((j) => j.stage !== "done" && j.stage !== "failed");
      jobsTimer.current = window.setTimeout(
        () => void tick(),
        active ? POLL_ACTIVE_MS : POLL_IDLE_MS,
      );
    };
    void tick();
    return () => {
      cancelled = true;
      if (jobsTimer.current) window.clearTimeout(jobsTimer.current);
      if (loginTimer.current) window.clearInterval(loginTimer.current);
    };
  }, [loadSessions, validateSessions, refreshJobs]);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

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
            useToastStore.getState().show("success", t("publishCenter.loggedInToast"));
          } else if (status === "failed" || status === "timeout") {
            stopLogin();
            useToastStore
              .getState()
              .show(
                "error",
                status === "timeout"
                  ? t("publishCenter.loginTimedOut", { message })
                  : t("publishCenter.loginFailed", { message }),
              );
          }
        } catch {
          /* transient; keep polling */
        }
      }, 2000);
    } catch {
      setLoginPlatform(null);
      useToastStore.getState().show("error", t("publishCenter.couldntStartLogin"));
    }
  }

  const platforms = useMemo(() => Object.keys(sessions), [sessions]);

  return (
    <div className="beatos-card beatos-scroll h-full overflow-y-auto rounded-xl p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-text-primary">{t("publishCenter.title")}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-accent/50 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
          >
            <Rocket size={13} /> {t("publishCenter.publishTrack")}
          </button>
          <button
            type="button"
            onClick={() => void validateSessions(true)}
            disabled={validating}
            className="flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-row-hover disabled:opacity-50"
          >
            <RefreshCw size={13} className={validating ? "animate-spin" : ""} />{" "}
            {t("publishCenter.refresh")}
          </button>
        </div>
      </div>

      <div className={`${SECTION} mb-2`}>{t("publishCenter.accountSessions")}</div>
      <div className="mb-6 flex flex-col gap-1.5">
        {platforms.length === 0 ? (
          <div className="text-xs text-text-tertiary">{t("publishCenter.noPlatforms")}</div>
        ) : (
          platforms.map((p) => (
            <SessionHealthRow
              key={p}
              platform={p}
              state={sessions[p]}
              checkedAt={validatedAt[p]}
              loggingIn={loginPlatform === p}
              onLogin={() => void handleLogin(p)}
            />
          ))
        )}
      </div>

      <div className={`${SECTION} mb-2`}>{t("publishCenter.activity")}</div>
      <div className="flex flex-col gap-1.5">
        {jobs.length === 0 ? (
          <div className="text-xs text-text-tertiary">{t("publishCenter.noPublishes")}</div>
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

      <PublishTrackPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => {
          setPickerOpen(false);
          setPublishTrackId(id);
        }}
      />
      {publishTrackId != null && (
        <PublishDialog
          open
          trackId={publishTrackId}
          onClose={() => {
            setPublishTrackId(null);
            void refreshJobs();
          }}
        />
      )}
    </div>
  );
}
