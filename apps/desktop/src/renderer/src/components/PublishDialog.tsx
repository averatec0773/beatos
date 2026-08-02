import { useEffect, useMemo, useRef, useState } from "react";
import {
  Rocket,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MonitorSmartphone,
  Clock,
  Puzzle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { exportApi, type ExportResult } from "@/api/export";
import { assets as assetsApi, type Asset } from "@/api/assets";
import { publishApi, type PublishJob } from "@/api/publish";
import { useToastStore } from "@/stores/toast";
import { usePublishCenterStore } from "@/stores/publish-center";

interface Props {
  open: boolean;
  trackId: number;
  platform?: string;
  // Platforms the user may publish to (from the Publish Center session list). When
  // more than one is available the header shows a selector; otherwise a static badge.
  platforms?: string[];
  onClose: () => void;
}

// Stage labels are resolved via t() inside the component (see stageLabel below).

// A publish stops polling on any of these terminal stages. awaiting_* are the
// human gates: the engine filled+uploaded everything a machine can, and a person
// finishes in the browser (read the agreement + SMS verify).
const TERMINAL = new Set(["done", "failed", "expired", "awaiting_review", "awaiting_sms"]);
// A status/login poll gives up after this many CONSECUTIVE failed reads (~the
// sidecar going away mid-flight) so the dialog can't spin forever. A successful
// read resets the counter, so a long legit publish (human-in-loop) is unaffected.
const MAX_POLL_ERRORS = 10;
// Moved to publishDialog.awaitingMsg i18n key — rendered via t() inside the component.

// Audio selection ranks. Format is decoupled from role now, so we rank on
// (role, format) instead of format-encoded role names.
const _FMT_RANK: Record<string, number> = { wav: 0, flac: 1, mp3: 2 };
// Streamable PREVIEW (public): prefer tagged so the clean file isn't exposed;
// within a tag-state prefer lossless.
function previewRank(a: Asset): number {
  const tag = a.role === "audio_tagged" ? 0 : a.role === "audio_untagged" ? 1 : 9;
  return tag * 3 + (_FMT_RANK[a.format] ?? 8);
}
// Buyer DELIVERABLE WAV (lossless, no watermark): untagged before tagged.
function deliverableWavRank(a: Asset): number {
  return a.role === "audio_untagged" ? 0 : 1;
}
// Promo video for video platforms (douyin): prefer vertical 9:16.
const PROMO_VIDEO_ROLE_PRIORITY = [
  "promo_video_vertical",
  "promo_video_landscape",
  "promo_video_square",
];
// Short metadata rendered as a compact spec strip; everything else stacks.
const SPEC_KEYS = ["bpm", "key", "genre", "mood"];

function isAudioRole(role: string): boolean {
  return role.startsWith("audio_");
}
function isPromoVideoRole(role: string): boolean {
  return role.startsWith("promo_video");
}
function fileName(a: Asset): string {
  return a.rel_path ?? a.abs_path.split("/").pop() ?? a.abs_path;
}

const SELECT_CLS =
  "h-8 w-full min-w-0 rounded-md border border-border-subtle bg-transparent px-2 text-sm text-text-primary " +
  "focus:border-text-tertiary focus:outline-none disabled:opacity-40";

// One compact row per upload slot: fixed label column + select. Hints live in the
// title tooltip to keep each row to one line. Declared at module level (NOT inside
// PublishDialog) so it isn't re-created on every render (lint: no components during render).
function FileRow(props: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (id: number | null) => void;
  items: Asset[];
  emptyLabel: string;
  withRole?: boolean;
}): React.JSX.Element {
  return (
    <label className="grid grid-cols-[4.25rem_1fr] items-center gap-2" title={props.hint}>
      <span className="truncate text-xs text-text-secondary">{props.label}</span>
      <select
        aria-label={props.label}
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={props.items.length === 0 && props.value == null}
        className={SELECT_CLS}
      >
        <option value="">{props.emptyLabel}</option>
        {props.items.map((a) => (
          <option key={a.id} value={a.id}>
            {props.withRole ? `${a.role} · ${fileName(a)}` : fileName(a)}
          </option>
        ))}
      </select>
    </label>
  );
}
function pickFirst(list: Asset[], roles: string[]): Asset | undefined {
  return roles.map((role) => list.find((a) => a.role === role)).find(Boolean);
}

export function PublishDialog({
  open,
  trackId,
  platform = "netease",
  platforms,
  onClose,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  // The publish target can be switched in the header. Initialised from the
  // `platform` prop and reset whenever the dialog reopens or the prop changes;
  // a user pick only lives until the next reopen. All downstream logic
  // (export fields, session gate, upload body) keys on `selectedPlatform`.
  const [selectedPlatform, setSelectedPlatform] = useState(platform);
  useEffect(() => {
    setSelectedPlatform(platform);
  }, [platform, open]);
  const targetOptions = useMemo(() => {
    const list = platforms && platforms.length > 0 ? platforms : [platform];
    return list.includes(selectedPlatform) ? list : [selectedPlatform, ...list];
  }, [platforms, platform, selectedPlatform]);
  // Extension-mode publishing (fill in the user's OWN browser via the BeatOS
  // extension) is offered platform-by-platform as recipes land: BeatStars first
  // (extension design P1/P2). Default stays the automation-browser engine.
  const [publishMethod, setPublishMethod] = useState<"engine" | "extension">("engine");
  useEffect(() => {
    setPublishMethod("engine");
  }, [selectedPlatform, open]);
  const extensionCapable = selectedPlatform === "beatstars";
  const useExtension = extensionCapable && publishMethod === "extension";
  // Platform upload-page URL returned by an extension-mode stage — the user
  // opens it themselves; the extension side panel takes over from there.
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [trackAssets, setTrackAssets] = useState<Asset[]>([]);
  const [audioAssetId, setAudioAssetId] = useState<number | null>(null);
  const [coverAssetId, setCoverAssetId] = useState<number | null>(null);
  const [wavAssetId, setWavAssetId] = useState<number | null>(null);
  const [stemsAssetId, setStemsAssetId] = useState<number | null>(null);
  const [videoAssetId, setVideoAssetId] = useState<number | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Real session validity, reused from the Publish Center store (headless check +
  // 24h cache). NOT the cheap file-existence check — an expired session file still
  // "exists", and gating on existence used to launch a browser into a dead session.
  const sessionState = usePublishCenterStore((s) => s.sessions[selectedPlatform]);
  const loadSessions = usePublishCenterStore((s) => s.loadSessions);
  const validateSessions = usePublishCenterStore((s) => s.validateSessions);
  // undefined / "checking" = still verifying; "valid"/"unknown" may publish;
  // "expired"/"not_logged_in" must not.
  const sessionChecking = sessionState === undefined || sessionState === "checking";
  const sessionBlocked = sessionState === "expired" || sessionState === "not_logged_in";
  const canPublishSession = sessionState === "valid" || sessionState === "unknown";
  const [job, setJob] = useState<PublishJob | null>(null);
  const [publishing, setPublishing] = useState(false);
  const pollRef = useRef<number | null>(null);
  const loginPollRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const audioAssets = useMemo(() => trackAssets.filter((a) => isAudioRole(a.role)), [trackAssets]);
  const wavAssets = useMemo(
    () => trackAssets.filter((a) => isAudioRole(a.role) && a.format === "wav"),
    [trackAssets],
  );
  const coverAssets = useMemo(() => trackAssets.filter((a) => a.role === "cover"), [trackAssets]);
  const stemsAssets = useMemo(() => trackAssets.filter((a) => a.role === "stems"), [trackAssets]);
  const videoAssets = useMemo(
    () => trackAssets.filter((a) => isPromoVideoRole(a.role)),
    [trackAssets],
  );
  const isDouyin = selectedPlatform === "douyin";

  const specFields = useMemo(
    () =>
      SPEC_KEYS.map((k) => result?.fields.find((f) => f.key === k)).filter(
        (f): f is NonNullable<typeof f> => Boolean(f && f.value),
      ),
    [result],
  );
  const blockFields = useMemo(
    () => (result?.fields ?? []).filter((f) => !SPEC_KEYS.includes(f.key)),
    [result],
  );

  async function startLogin(): Promise<void> {
    if (loginPollRef.current) {
      window.clearInterval(loginPollRef.current);
      loginPollRef.current = null;
    }
    setLoggingIn(true);
    try {
      const { login_id } = await publishApi.login(selectedPlatform);
      if (!mountedRef.current) return;
      let loginErrors = 0;
      loginPollRef.current = window.setInterval(async () => {
        try {
          const { status } = await publishApi.loginStatus(login_id);
          loginErrors = 0;
          if (status === "success") {
            if (loginPollRef.current) {
              window.clearInterval(loginPollRef.current);
              loginPollRef.current = null;
            }
            if (!mountedRef.current) return;
            setLoggingIn(false);
            // Re-check for real: loadSessions sees the now-present session file and
            // marks it stale, then validateSessions confirms it's actually live.
            // Scoped to the target platform so the dialog doesn't cold-probe others.
            await loadSessions();
            if (!mountedRef.current) return;
            await validateSessions(false, [selectedPlatform]);
          } else if (status === "failed" || status === "timeout") {
            if (loginPollRef.current) {
              window.clearInterval(loginPollRef.current);
              loginPollRef.current = null;
            }
            if (!mountedRef.current) return;
            setLoggingIn(false);
            useToastStore.getState().show("error", t("publishDialog.loginNotCompleted"));
          }
        } catch {
          // Transient blips are tolerated; sustained unreachability (sidecar gone)
          // stops the poll instead of spinning forever.
          loginErrors += 1;
          if (loginErrors >= MAX_POLL_ERRORS) {
            if (loginPollRef.current) {
              window.clearInterval(loginPollRef.current);
              loginPollRef.current = null;
            }
            if (!mountedRef.current) return;
            setLoggingIn(false);
            useToastStore.getState().show("error", t("publishDialog.connectionLost"));
          }
        }
      }, 2000);
    } catch {
      if (!mountedRef.current) return;
      setLoggingIn(false);
      useToastStore.getState().show("error", t("publishDialog.couldntStartLogin"));
    }
  }

  const stopPolling = (): void => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (loginPollRef.current != null) {
      window.clearInterval(loginPollRef.current);
      loginPollRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setResult(null);
    setJob(null);
    setTicketUrl(null);
    setTrackAssets([]);
    setAudioAssetId(null);
    setCoverAssetId(null);
    setWavAssetId(null);
    setStemsAssetId(null);
    setVideoAssetId(null);

    exportApi
      .forTrack(trackId, selectedPlatform)
      .then((r) => !cancelled && setResult(r))
      .catch(() => {
        if (!cancelled)
          useToastStore.getState().show("error", t("publishDialog.failedToLoadMetadata"));
      });

    assetsApi
      .listForTrack(trackId)
      .then((list) => {
        if (cancelled) return;
        setTrackAssets(list);
        const audio = list.filter((a) => isAudioRole(a.role));
        const preview = [...audio].sort((x, y) => previewRank(x) - previewRank(y))[0];
        if (preview) setAudioAssetId(preview.id);
        const wav = audio
          .filter((a) => a.format === "wav")
          .sort((x, y) => deliverableWavRank(x) - deliverableWavRank(y))[0];
        if (wav) setWavAssetId(wav.id);
        const stems = list.find((a) => a.role === "stems");
        if (stems) setStemsAssetId(stems.id);
        const cover = list.find((a) => a.role === "cover");
        if (cover) setCoverAssetId(cover.id);
        const video = pickFirst(list, PROMO_VIDEO_ROLE_PRIORITY);
        if (video) setVideoAssetId(video.id);
      })
      .catch(() => {
        if (!cancelled)
          useToastStore.getState().show("error", t("publishDialog.failedToLoadAssets"));
      });

    // Real validity check (headless), cached 24h by the store so repeat opens are
    // instant. Gating Publish on this instead of file-existence is the fix for
    // launching into an expired session. Scoped to the target platform only.
    void (async () => {
      await loadSessions();
      if (cancelled) return;
      await validateSessions(false, [selectedPlatform]);
    })();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [open, trackId, selectedPlatform]);

  useEffect(() => stopPolling, []);

  async function handlePublish(): Promise<void> {
    if (isDouyin ? videoAssetId == null : audioAssetId == null) {
      useToastStore
        .getState()
        .show(
          "warning",
          isDouyin
            ? t("publishDialog.selectPromoVideoFirst")
            : t("publishDialog.selectPreviewAudioFirst"),
        );
      return;
    }
    setPublishing(true);
    setJob(null);
    setTicketUrl(null);
    try {
      const body = isDouyin
        ? {
            track_id: trackId,
            platform: selectedPlatform,
            video_asset_id: videoAssetId ?? undefined,
            cover_asset_id: coverAssetId ?? undefined,
          }
        : {
            track_id: trackId,
            platform: selectedPlatform,
            // Extension mode stages a ticket instead of launching the engine
            // browser; polling below is unchanged (same job registry).
            ...(useExtension ? { mode: "extension" as const } : {}),
            audio_asset_id: audioAssetId ?? undefined,
            cover_asset_id: coverAssetId ?? undefined,
            deliverable_wav_asset_id: wavAssetId ?? undefined,
            deliverable_stems_asset_id: stemsAssetId ?? undefined,
          };
      const { job_id, upload_url } = await publishApi.create(body);
      if (upload_url) setTicketUrl(upload_url);
      stopPolling();
      let pollErrors = 0;
      pollRef.current = window.setInterval(async () => {
        try {
          const status = await publishApi.status(job_id);
          pollErrors = 0;
          setJob(status);
          if (TERMINAL.has(status.stage)) {
            stopPolling();
            setPublishing(false);
          }
        } catch {
          // Transient blips are tolerated; sustained unreachability (sidecar gone)
          // stops the spinner instead of polling forever.
          pollErrors += 1;
          if (pollErrors >= MAX_POLL_ERRORS) {
            stopPolling();
            setPublishing(false);
            useToastStore.getState().show("error", t("publishDialog.connectionLost"));
          }
        }
      }, 1500);
    } catch {
      useToastStore.getState().show("error", t("publishDialog.publishFailed"));
      setPublishing(false);
    }
  }

  const stage = job?.stage;
  const isAwaiting = stage === "awaiting_review" || stage === "awaiting_sms";
  const inProgress = Boolean(job) && !TERMINAL.has(stage ?? "");
  const STAGE_KEY: Record<string, string> = {
    queued: "publishDialog.stageQueued",
    staged: "publishDialog.stageStaged",
    claimed: "publishDialog.stageClaimed",
    launching: "publishDialog.stageLaunching",
    navigating: "publishDialog.stageNavigating",
    creating_album: "publishDialog.stageCreatingAlbum",
    uploading_audio: "publishDialog.stageUploadingAudio",
    uploading_cover: "publishDialog.stageUploadingCover",
    filling_metadata: "publishDialog.stageFillingMetadata",
    uploading_deliverables: "publishDialog.stageUploadingDeliverables",
    submitting: "publishDialog.stageSubmitting",
    awaiting_review: "publishDialog.stageAwaitingReview",
    awaiting_sms: "publishDialog.stageAwaitingSms",
    done: "publishDialog.stageDone",
    failed: "publishDialog.stageFailed",
    expired: "publishDialog.stageExpired",
  };

  const stageLabel = stage
    ? STAGE_KEY[stage]
      ? (i18n.t(STAGE_KEY[stage] as any) as string)
      : stage
    : null;

  const sectionCls = "text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* No formal description — the title + labelled sections describe it. Explicit
          undefined opts out of Radix's aria-describedby warning. */}
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("publishDialog.publishToPlatform")}
            {targetOptions.length > 1 ? (
              <select
                aria-label={t("publishDialog.publishToPlatform")}
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                disabled={publishing || inProgress}
                className="rounded border border-border-subtle bg-transparent px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-text-secondary focus:border-text-tertiary focus:outline-none disabled:opacity-40"
              >
                {targetOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-text-tertiary">
                {selectedPlatform}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {extensionCapable && (
          <div
            role="radiogroup"
            aria-label={t("publishDialog.publishMethod")}
            className="mb-3 flex items-center gap-3 text-xs text-text-secondary"
          >
            <span className={sectionCls}>{t("publishDialog.publishMethod")}</span>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="publish-method"
                checked={publishMethod === "engine"}
                onChange={() => setPublishMethod("engine")}
                disabled={publishing || inProgress}
              />
              {t("publishDialog.methodEngine")}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="publish-method"
                checked={publishMethod === "extension"}
                onChange={() => setPublishMethod("extension")}
                disabled={publishing || inProgress}
              />
              {t("publishDialog.methodExtension")}
            </label>
          </div>
        )}

        {/* Session banners concern the automation-browser session only — the
            extension rides the user's own logged-in browser. */}
        {!useExtension && sessionChecking && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-xs text-text-secondary">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            {t("publishDialog.checkingSession")}
          </div>
        )}

        {!useExtension && sessionBlocked && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {sessionState === "expired"
                ? t("publishDialog.sessionExpired")
                : t("publishDialog.logInFirst")}
            </span>
            <button
              type="button"
              disabled={loggingIn}
              onClick={() => void startLogin()}
              className="rounded border border-warning/50 px-2 py-0.5 text-warning hover:bg-warning/20 disabled:opacity-50"
            >
              {loggingIn
                ? t("publishDialog.browserOpen")
                : sessionState === "expired"
                  ? t("publishDialog.reLogin")
                  : t("publishDialog.logIn")}
            </button>
          </div>
        )}

        {!useExtension && sessionState === "unknown" && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-text-secondary">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
            {t("publishDialog.sessionUnknown")}
          </div>
        )}

        {/* — upload slots — */}
        <div className={`${sectionCls} mb-2`}>{t("publishDialog.files")}</div>
        <div className="mb-4 flex flex-col gap-1.5">
          {isDouyin ? (
            <>
              <FileRow
                label={t("publishDialog.slotPromoVideo")}
                hint={t("publishDialog.slotPromoVideoHint")}
                value={videoAssetId}
                onChange={setVideoAssetId}
                items={videoAssets}
                emptyLabel={t("publishDialog.noVideoAvailable")}
                withRole
              />
              <FileRow
                label={t("publishDialog.slotCover")}
                hint={t("publishDialog.slotVideoCoverHint")}
                value={coverAssetId}
                onChange={setCoverAssetId}
                items={coverAssets}
                emptyLabel={t("publishDialog.noCover")}
              />
            </>
          ) : (
            <>
              <FileRow
                label={t("publishDialog.slotPreviewAudio")}
                hint={t("publishDialog.slotPreviewAudioHint")}
                value={audioAssetId}
                onChange={setAudioAssetId}
                items={audioAssets}
                emptyLabel={t("publishDialog.noAudioAvailable")}
                withRole
              />
              <FileRow
                label={t("publishDialog.slotDeliverableWav")}
                hint={t("publishDialog.slotDeliverableWavHint")}
                value={wavAssetId}
                onChange={setWavAssetId}
                items={wavAssets}
                emptyLabel={t("publishDialog.dontUpload")}
                withRole
              />
              <FileRow
                label={t("publishDialog.slotStems")}
                hint={t("publishDialog.slotStemsHint")}
                value={stemsAssetId}
                onChange={setStemsAssetId}
                items={stemsAssets}
                emptyLabel={t("publishDialog.dontUpload")}
              />
              <FileRow
                label={t("publishDialog.slotCover")}
                hint={t("publishDialog.slotCoverHint")}
                value={coverAssetId}
                onChange={setCoverAssetId}
                items={coverAssets}
                emptyLabel={t("publishDialog.noCover")}
              />
            </>
          )}
        </div>

        {/* — metadata review — */}
        <div className={`${sectionCls} mb-2`}>{t("publishDialog.metadata")}</div>
        <div className="max-h-[34vh] overflow-y-auto beatos-scroll pr-1">
          {specFields.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {specFields.map((f) => (
                <span
                  key={f.key}
                  className="inline-flex items-baseline gap-1 rounded border border-border-subtle px-1.5 py-0.5 text-xs"
                >
                  <span className="text-text-tertiary">{f.label}</span>
                  <span className="text-text-primary">{f.value}</span>
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {blockFields.map((f) => {
              const v = f.value || (f.options.length ? f.options.join("\u3001") : "");
              return (
                <div key={f.key} className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-text-tertiary">
                    {f.label}
                  </span>
                  <span className="whitespace-pre-wrap text-sm leading-snug text-text-primary">
                    {v || <span className="text-text-tertiary">—</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* — extension staged hand-off: the ticket waits for the user's own
            browser; from "filling" onward the stage spinner takes over — */}
        {useExtension && job && (stage === "staged" || stage === "claimed") && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-xs text-text-secondary">
            <Puzzle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-snug">
              {t("publishDialog.extensionStagedMsg")}
              {ticketUrl && (
                <>
                  {" — "}
                  <a href={ticketUrl} target="_blank" rel="noreferrer" className="underline">
                    {t("publishDialog.openPlatformPage")}
                  </a>
                </>
              )}
            </span>
          </div>
        )}

        {/* — status + action — */}
        {(isAwaiting ||
          (job && stage === "done") ||
          (job && stage === "failed") ||
          (job && stage === "expired")) && (
          <div className="mt-3">
            {isAwaiting && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-snug">{t("publishDialog.awaitingMsg")}</span>
              </div>
            )}
            {stage === "expired" && (
              <div className="flex items-start gap-2 rounded-md border border-text-tertiary/40 bg-bg-elevated px-3 py-2 text-xs text-text-secondary">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-snug">{t("publishDialog.expiredMsg")}</span>
              </div>
            )}
            {stage === "done" && (
              <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  {t("publishDialog.published")}
                  {job?.result?.url && (
                    <>
                      {" — "}
                      <a
                        href={job.result.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {t("publishDialog.view")}
                      </a>
                    </>
                  )}
                </span>
              </div>
            )}
            {stage === "failed" && (
              <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-snug">
                  {t("publishDialog.publishFailedDetail", {
                    error: job?.result?.error ?? job?.message,
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="items-center">
          {inProgress && (
            <span className="mr-auto flex items-center gap-1.5 text-xs text-text-secondary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {stageLabel ?? ""}…
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="gap-1.5"
            onClick={handlePublish}
            disabled={
              publishing ||
              // The automation-session gate applies to the engine path only —
              // extension mode fills in the user's own logged-in browser.
              (!useExtension && !canPublishSession) ||
              (isDouyin ? videoAssetId == null : audioAssetId == null)
            }
          >
            <Rocket className="h-3.5 w-3.5" /> {t("publishDialog.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
