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
  queued: "排队中",
  launching: "启动浏览器",
  navigating: "打开上传页",
  uploading_audio: "上传预览音频",
  uploading_cover: "上传封面",
  filling_metadata: "填写元数据",
  uploading_deliverables: "上传交付文件",
  submitting: "提交中",
  awaiting_review: "等待人工完成",
  awaiting_sms: "等待人工完成",
  done: "已完成",
  failed: "失败",
};

// A publish stops polling on any of these terminal stages. awaiting_* are the
// human gates: the engine filled+uploaded everything a machine can, and a person
// finishes in the browser (read the agreement + SMS verify).
const TERMINAL = new Set(["done", "failed", "awaiting_review", "awaiting_sms"]);
const AWAITING_MSG = "已自动上传，请在浏览器完成最后一步阅读用户协议并短信验证";

// Streamable PREVIEW (public): prefer tagged so the clean file isn't exposed.
const PREVIEW_ROLE_PRIORITY = [
  "audio_tagged_wav",
  "audio_tagged_mp3",
  "audio_untagged_wav",
  "audio_untagged_mp3",
];
// Buyer DELIVERABLE WAV (lossless, no watermark).
const DELIVERABLE_WAV_PRIORITY = ["audio_untagged_wav", "audio_tagged_wav"];
// Short metadata rendered as a compact spec strip; everything else stacks.
const SPEC_KEYS = ["bpm", "key", "genre", "mood"];

function isAudioRole(role: string): boolean {
  return role.startsWith("audio_");
}
function isWavRole(role: string): boolean {
  return role.startsWith("audio_") && role.endsWith("_wav");
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
  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [job, setJob] = useState<PublishJob | null>(null);
  const [publishing, setPublishing] = useState(false);
  const pollRef = useRef<number | null>(null);

  const audioAssets = useMemo(
    () => trackAssets.filter((a) => isAudioRole(a.role)),
    [trackAssets],
  );
  const wavAssets = useMemo(() => trackAssets.filter((a) => isWavRole(a.role)), [trackAssets]);
  const coverAssets = useMemo(() => trackAssets.filter((a) => a.role === "cover"), [trackAssets]);
  const stemsAssets = useMemo(() => trackAssets.filter((a) => a.role === "stems"), [trackAssets]);

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

  const stopPolling = (): void => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
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
    setSessionOk(null);

    exportApi
      .forTrack(trackId, platform)
      .then((r) => !cancelled && setResult(r))
      .catch(() => {
        if (!cancelled) useToastStore.getState().show("error", "加载元数据失败");
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
      })
      .catch(() => {
        if (!cancelled) useToastStore.getState().show("error", "加载素材失败");
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
    if (audioAssetId == null) {
      useToastStore.getState().show("warning", "请先选择预览音频");
      return;
    }
    setPublishing(true);
    setJob(null);
    try {
      const { job_id } = await publishApi.create({
        track_id: trackId,
        platform,
        audio_asset_id: audioAssetId,
        cover_asset_id: coverAssetId ?? undefined,
        deliverable_wav_asset_id: wavAssetId ?? undefined,
        deliverable_stems_asset_id: stemsAssetId ?? undefined,
      });
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
      useToastStore.getState().show("error", "发布失败");
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
            发布到平台
            <span className="rounded border border-border-subtle px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-text-tertiary">
              {platform}
            </span>
          </DialogTitle>
        </DialogHeader>

        {sessionOk === false && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              需要先登录网易云 —— 终端运行{" "}
              <code className="rounded bg-bg-row-hover px-1">
                uv run python scripts/publish-dev.py login
              </code>
            </span>
          </div>
        )}

        {/* — upload slots — */}
        <div className={`${sectionCls} mb-2`}>上传文件</div>
        <div className="mb-4 flex flex-col gap-1.5">
          <FileRow
            label="预览音频"
            hint="平台公开试听版，默认带标签 tagged（防止白嫖无水印版）"
            value={audioAssetId}
            onChange={setAudioAssetId}
            items={audioAssets}
            emptyLabel="无可用音频"
            withRole
          />
          <FileRow
            label="交付 WAV"
            hint="付费买家下载的无水印高音质，默认 untagged WAV（租赁档必传）"
            value={wavAssetId}
            onChange={setWavAssetId}
            items={wavAssets}
            emptyLabel="不上传"
            withRole
          />
          <FileRow
            label="分轨"
            hint="分轨档买家拿到的 stems 包（<200MB；无则跳过该档）"
            value={stemsAssetId}
            onChange={setStemsAssetId}
            items={stemsAssets}
            emptyLabel="不上传"
          />
          <FileRow
            label="封面"
            hint="专辑封面，默认当前 track 封面"
            value={coverAssetId}
            onChange={setCoverAssetId}
            items={coverAssets}
            emptyLabel="无封面"
          />
        </div>

        {/* — metadata review — */}
        <div className={`${sectionCls} mb-2`}>元数据</div>
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
                  发布成功
                  {job?.result?.url && (
                    <>
                      {" — "}
                      <a href={job.result.url} target="_blank" rel="noreferrer" className="underline">
                        查看
                      </a>
                    </>
                  )}
                </span>
              </div>
            )}
            {stage === "failed" && (
              <div className="flex items-start gap-2 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="leading-snug">发布失败：{job?.result?.error ?? job?.message}</span>
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
            disabled={publishing || sessionOk === false || audioAssetId == null}
            className="inline-flex items-center gap-1.5 rounded-md bg-text-primary px-3.5 py-1.5 text-sm font-medium text-bg-base hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Rocket className="h-3.5 w-3.5" /> 发布
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
