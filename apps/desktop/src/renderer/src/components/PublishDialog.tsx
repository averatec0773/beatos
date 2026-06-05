import { useEffect, useMemo, useRef, useState } from "react";
import { Rocket, Loader2, CheckCircle2, AlertCircle, MonitorSmartphone } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportApi, type ExportResult } from "@/api/export";
import { assets as assetsApi, type Asset } from "@/api/assets";
import { publishApi, type PublishJob } from "@/api/publish";
import { useToastStore } from "@/stores/toast";

interface Props {
  open: boolean;
  trackId: number;
  platform?: string;
  onClose: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  launching: "Launching browser",
  navigating: "Opening upload page",
  uploading_audio: "Uploading preview audio",
  uploading_cover: "Uploading cover",
  filling_metadata: "Filling metadata",
  uploading_deliverables: "Uploading deliverables",
  submitting: "Submitting",
  awaiting_review: "Waiting for you",
  awaiting_sms: "Waiting for you",
  done: "Done",
  failed: "Failed",
};

// A publish stops polling on any of these terminal stages. awaiting_* are the
// human gates: the engine filled+uploaded everything a machine can, and a person
// finishes in the browser (read the agreement + SMS verify).
const TERMINAL = new Set(["done", "failed", "awaiting_review", "awaiting_sms"]);
const AWAITING_MSG =
  "Auto-uploaded — finish the last step in the browser (read the agreement, then SMS-verify).";

// Streamable PREVIEW (public): prefer tagged so the clean file isn't exposed.
const PREVIEW_ROLE_PRIORITY = [
  "audio_tagged_wav",
  "audio_tagged_mp3",
  "audio_untagged_wav",
  "audio_untagged_mp3",
];
// Buyer DELIVERABLE WAV (lossless, no watermark).
const DELIVERABLE_WAV_PRIORITY = ["audio_untagged_wav", "audio_tagged_wav"];
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
function isWavRole(role: string): boolean {
  return role.startsWith("audio_") && role.endsWith("_wav");
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
  onClose,
}: Props): React.JSX.Element {
  const [result, setResult] = useState<ExportResult | null>(null);
  const [trackAssets, setTrackAssets] = useState<Asset[]>([]);
  const [audioAssetId, setAudioAssetId] = useState<number | null>(null);
  const [coverAssetId, setCoverAssetId] = useState<number | null>(null);
  const [wavAssetId, setWavAssetId] = useState<number | null>(null);
  const [stemsAssetId, setStemsAssetId] = useState<number | null>(null);
  const [videoAssetId, setVideoAssetId] = useState<number | null>(null);
  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [job, setJob] = useState<PublishJob | null>(null);
  const [publishing, setPublishing] = useState(false);
  const pollRef = useRef<number | null>(null);
  const loginPollRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const audioAssets = useMemo(
    () => trackAssets.filter((a) => isAudioRole(a.role)),
    [trackAssets],
  );
  const wavAssets = useMemo(() => trackAssets.filter((a) => isWavRole(a.role)), [trackAssets]);
  const coverAssets = useMemo(() => trackAssets.filter((a) => a.role === "cover"), [trackAssets]);
  const stemsAssets = useMemo(() => trackAssets.filter((a) => a.role === "stems"), [trackAssets]);
  const videoAssets = useMemo(
    () => trackAssets.filter((a) => isPromoVideoRole(a.role)),
    [trackAssets],
  );
  const isDouyin = platform === "douyin";

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
      const { login_id } = await publishApi.login(platform);
      if (!mountedRef.current) return;
      loginPollRef.current = window.setInterval(async () => {
        try {
          const { status } = await publishApi.loginStatus(login_id);
          if (status === "success") {
            if (loginPollRef.current) {
              window.clearInterval(loginPollRef.current);
              loginPollRef.current = null;
            }
            if (!mountedRef.current) return;
            setLoggingIn(false);
            const s = await publishApi.sessions();
            if (!mountedRef.current) return;
            setSessionOk(Boolean(s.sessions?.[platform]));
          } else if (status === "failed" || status === "timeout") {
            if (loginPollRef.current) {
              window.clearInterval(loginPollRef.current);
              loginPollRef.current = null;
            }
            if (!mountedRef.current) return;
            setLoggingIn(false);
            useToastStore.getState().show("error", "Login not completed");
          }
        } catch {
          /* keep polling */
        }
      }, 2000);
    } catch {
      if (!mountedRef.current) return;
      setLoggingIn(false);
      useToastStore.getState().show("error", "Couldn't start login");
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
    setTrackAssets([]);
    setAudioAssetId(null);
    setCoverAssetId(null);
    setWavAssetId(null);
    setStemsAssetId(null);
    setVideoAssetId(null);
    setSessionOk(null);

    exportApi
      .forTrack(trackId, platform)
      .then((r) => !cancelled && setResult(r))
      .catch(() => {
        if (!cancelled) useToastStore.getState().show("error", "Failed to load metadata");
      });

    assetsApi
      .listForTrack(trackId)
      .then((list) => {
        if (cancelled) return;
        setTrackAssets(list);
        const preview =
          pickFirst(list, PREVIEW_ROLE_PRIORITY) ?? list.find((a) => isAudioRole(a.role));
        if (preview) setAudioAssetId(preview.id);
        const wav =
          pickFirst(list, DELIVERABLE_WAV_PRIORITY) ?? list.find((a) => isWavRole(a.role));
        if (wav) setWavAssetId(wav.id);
        const stems = list.find((a) => a.role === "stems");
        if (stems) setStemsAssetId(stems.id);
        const cover = list.find((a) => a.role === "cover");
        if (cover) setCoverAssetId(cover.id);
        const video = pickFirst(list, PROMO_VIDEO_ROLE_PRIORITY);
        if (video) setVideoAssetId(video.id);
      })
      .catch(() => {
        if (!cancelled) useToastStore.getState().show("error", "Failed to load assets");
      });

    publishApi
      .sessions()
      .then((s) => !cancelled && setSessionOk(Boolean(s.sessions?.[platform])))
      .catch(() => !cancelled && setSessionOk(false));

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [open, trackId, platform]);

  useEffect(() => stopPolling, []);

  async function handlePublish(): Promise<void> {
    if (isDouyin ? videoAssetId == null : audioAssetId == null) {
      useToastStore
        .getState()
        .show("warning", isDouyin ? "Select a promo video first" : "Select a preview audio first");
      return;
    }
    setPublishing(true);
    setJob(null);
    try {
      const body = isDouyin
        ? {
            track_id: trackId,
            platform,
            video_asset_id: videoAssetId ?? undefined,
            cover_asset_id: coverAssetId ?? undefined,
          }
        : {
            track_id: trackId,
            platform,
            audio_asset_id: audioAssetId ?? undefined,
            cover_asset_id: coverAssetId ?? undefined,
            deliverable_wav_asset_id: wavAssetId ?? undefined,
            deliverable_stems_asset_id: stemsAssetId ?? undefined,
          };
      const { job_id } = await publishApi.create(body);
      stopPolling();
      pollRef.current = window.setInterval(async () => {
        try {
          const status = await publishApi.status(job_id);
          setJob(status);
          if (TERMINAL.has(status.stage)) {
            stopPolling();
            setPublishing(false);
          }
        } catch {
          // transient; keep polling
        }
      }, 1500);
    } catch {
      useToastStore.getState().show("error", "Publish failed");
      setPublishing(false);
    }
  }

  const stage = job?.stage;
  const isAwaiting = stage === "awaiting_review" || stage === "awaiting_sms";
  const inProgress = Boolean(job) && !TERMINAL.has(stage ?? "");
  const stageLabel = stage ? (STAGE_LABELS[stage] ?? stage) : null;

  const sectionCls = "text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Publish to platform
            <span className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-text-tertiary">
              {platform}
            </span>
          </DialogTitle>
        </DialogHeader>

        {sessionOk === false && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Log in first
            </span>
            <button
              type="button"
              disabled={loggingIn}
              onClick={() => void startLogin()}
              className="rounded border border-warning/50 px-2 py-0.5 text-warning hover:bg-warning/20 disabled:opacity-50"
            >
              {loggingIn ? "Browser open…" : "Log in"}
            </button>
          </div>
        )}

        {/* — upload slots — */}
        <div className={`${sectionCls} mb-2`}>Files</div>
        <div className="mb-4 flex flex-col gap-1.5">
          {isDouyin ? (
            <>
              <FileRow
                label="Promo video"
                hint="Promo video published to Douyin (vertical 9:16 preferred)"
                value={videoAssetId}
                onChange={setVideoAssetId}
                items={videoAssets}
                emptyLabel="No video available"
                withRole
              />
              <FileRow
                label="Cover"
                hint="Video cover — defaults to the track's current cover (optional)"
                value={coverAssetId}
                onChange={setCoverAssetId}
                items={coverAssets}
                emptyLabel="No cover"
              />
            </>
          ) : (
            <>
              <FileRow
                label="Preview audio"
                hint="Public preview on the platform — defaults to the tagged version (so the clean file isn't exposed)"
                value={audioAssetId}
                onChange={setAudioAssetId}
                items={audioAssets}
                emptyLabel="No audio available"
                withRole
              />
              <FileRow
                label="Deliverable WAV"
                hint="Lossless no-watermark file paid buyers download — defaults to the untagged WAV (required for any rental tier)"
                value={wavAssetId}
                onChange={setWavAssetId}
                items={wavAssets}
                emptyLabel="Don't upload"
                withRole
              />
              <FileRow
                label="Stems"
                hint="Stems package buyers of the stems tier receive (<200MB; skip the tier if none)"
                value={stemsAssetId}
                onChange={setStemsAssetId}
                items={stemsAssets}
                emptyLabel="Don't upload"
              />
              <FileRow
                label="Cover"
                hint="Album cover — defaults to the track's current cover"
                value={coverAssetId}
                onChange={setCoverAssetId}
                items={coverAssets}
                emptyLabel="No cover"
              />
            </>
          )}
        </div>

        {/* — metadata review — */}
        <div className={`${sectionCls} mb-2`}>Metadata</div>
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
              const v = f.value || (f.options.length ? f.options.join("、") : "");
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

        {/* — status + action — */}
        {(isAwaiting || (job && stage === "done") || (job && stage === "failed")) && (
          <div className="mt-3">
            {isAwaiting && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-snug">{AWAITING_MSG}</span>
              </div>
            )}
            {stage === "done" && (
              <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>
                  Published
                  {job?.result?.url && (
                    <>
                      {" — "}
                      <a href={job.result.url} target="_blank" rel="noreferrer" className="underline">
                        View
                      </a>
                    </>
                  )}
                </span>
              </div>
            )}
            {stage === "failed" && (
              <div className="flex items-start gap-2 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-snug">Publish failed: {job?.result?.error ?? job?.message}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-3">
          {inProgress && (
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {stageLabel}…
            </span>
          )}
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || sessionOk === false || (isDouyin ? videoAssetId == null : audioAssetId == null)}
            className="inline-flex items-center gap-1.5 rounded-md bg-text-primary px-3.5 py-1.5 text-sm font-medium text-bg-base hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Rocket className="h-3.5 w-3.5" /> Publish
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
