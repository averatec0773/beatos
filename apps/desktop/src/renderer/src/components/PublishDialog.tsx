import { useEffect, useMemo, useRef, useState } from "react";
import { Rocket } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  awaiting_review: "已填好，请在浏览器核对",
  awaiting_sms: "等待手机短信验证码",
  done: "已完成",
  failed: "失败",
};

// The streamable PREVIEW (public試聽). Prefer the tagged version so the clean
// file can't be ripped for free; fall back to untagged if no tagged exists.
const PREVIEW_ROLE_PRIORITY = [
  "audio_tagged_wav",
  "audio_tagged_mp3",
  "audio_untagged_wav",
  "audio_untagged_mp3",
];
// The buyer DELIVERABLE WAV (lossless, no watermark) uploaded into the license drawer.
const DELIVERABLE_WAV_PRIORITY = ["audio_untagged_wav", "audio_tagged_wav"];

function isAudioRole(role: string): boolean {
  return role.startsWith("audio_");
}
function isWavRole(role: string): boolean {
  return role.startsWith("audio_") && role.endsWith("_wav");
}

function fileName(a: Asset): string {
  return a.rel_path ?? a.abs_path.split("/").pop() ?? a.abs_path;
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

  // Derive option lists from the track's assets (rule 4: no derivation in selectors).
  const audioAssets = useMemo(
    () => trackAssets.filter((a) => isAudioRole(a.role)),
    [trackAssets],
  );
  const wavAssets = useMemo(() => trackAssets.filter((a) => isWavRole(a.role)), [trackAssets]);
  const coverAssets = useMemo(
    () => trackAssets.filter((a) => a.role === "cover"),
    [trackAssets],
  );
  const stemsAssets = useMemo(
    () => trackAssets.filter((a) => a.role === "stems"),
    [trackAssets],
  );

  const stopPolling = (): void => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Reset + load metadata, assets, session when opened.
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
        // Preview: tagged WAV → tagged MP3 → untagged → any audio.
        const preview =
          pickFirst(list, PREVIEW_ROLE_PRIORITY) ?? list.find((a) => isAudioRole(a.role));
        if (preview) setAudioAssetId(preview.id);
        // Deliverable WAV: untagged WAV → tagged WAV → any WAV.
        const wav =
          pickFirst(list, DELIVERABLE_WAV_PRIORITY) ?? list.find((a) => isWavRole(a.role));
        if (wav) setWavAssetId(wav.id);
        // Stems + cover: their dedicated roles.
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
          if (status.stage === "done" || status.stage === "failed") {
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

  const stageLabel = job ? (STAGE_LABELS[job.stage] ?? job.stage) : null;

  const selectCls =
    "rounded-md border border-border-subtle bg-transparent px-2 py-1 text-sm text-text-primary disabled:opacity-40";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>发布到平台</DialogTitle>
          <DialogDescription>核对信息后一键发布（{platform}）。</DialogDescription>
        </DialogHeader>

        {sessionOk === false && (
          <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            需要先登录网易云（在终端运行 uv run python scripts/publish-dev.py login）
          </div>
        )}

        <div className="mb-3 flex flex-col gap-3">
          {/* ① streamable preview */}
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            预览音频
            <span className="text-[11px] text-text-tertiary">
              平台公开试听版（默认带标签 tagged，防止白嫖无水印版）
            </span>
            <select
              aria-label="预览音频"
              value={audioAssetId ?? ""}
              onChange={(e) => setAudioAssetId(e.target.value ? Number(e.target.value) : null)}
              disabled={audioAssets.length === 0}
              className={selectCls}
            >
              {audioAssets.length === 0 && <option value="">无可用音频</option>}
              {audioAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.role} — {fileName(a)}
                </option>
              ))}
            </select>
          </label>

          {/* ② buyer deliverable WAV */}
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            交付 WAV（买家下载）
            <span className="text-[11px] text-text-tertiary">
              付费买家拿到的无水印高音质（默认 untagged WAV，租赁档必传）
            </span>
            <select
              aria-label="交付 WAV"
              value={wavAssetId ?? ""}
              onChange={(e) => setWavAssetId(e.target.value ? Number(e.target.value) : null)}
              className={selectCls}
            >
              <option value="">不上传交付 WAV</option>
              {wavAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.role} — {fileName(a)}
                </option>
              ))}
            </select>
          </label>

          {/* ③ stems for the 分轨 tier */}
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            分轨 stems（可选）
            <span className="text-[11px] text-text-tertiary">
              分轨档买家拿到的 stems 包（&lt;200MB；无则跳过该档）
            </span>
            <select
              aria-label="分轨 stems"
              value={stemsAssetId ?? ""}
              onChange={(e) => setStemsAssetId(e.target.value ? Number(e.target.value) : null)}
              disabled={stemsAssets.length === 0}
              className={selectCls}
            >
              <option value="">不上传分轨</option>
              {stemsAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {fileName(a)}
                </option>
              ))}
            </select>
          </label>

          {/* ④ cover */}
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            封面
            <select
              aria-label="封面"
              value={coverAssetId ?? ""}
              onChange={(e) => setCoverAssetId(e.target.value ? Number(e.target.value) : null)}
              className={selectCls}
            >
              <option value="">无封面</option>
              {coverAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {fileName(a)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="max-h-[40vh] overflow-y-auto beatos-scroll">
          {result?.fields.map((f) => (
            <div
              key={f.key}
              className="flex items-start gap-2 py-1.5 border-b border-border-subtle"
            >
              <div className="w-16 shrink-0 text-xs text-text-secondary pt-0.5">{f.label}</div>
              <div className="flex-1 whitespace-pre-wrap text-sm">
                {f.value || (f.options.length ? f.options.join("、") : null) || (
                  <span className="text-text-tertiary">—</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-xs">
            {job && job.stage === "done" && (
              <span className="text-success">
                发布成功
                {job.result?.url && (
                  <>
                    {" — "}
                    <a
                      href={job.result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      查看
                    </a>
                  </>
                )}
              </span>
            )}
            {job && job.stage === "failed" && (
              <span className="text-error">发布失败：{job.result?.error ?? job.message}</span>
            )}
            {job && job.stage !== "done" && job.stage !== "failed" && (
              <span className="text-text-secondary">{stageLabel}…</span>
            )}
          </div>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || sessionOk === false || audioAssetId == null}
            className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-3 py-1.5 text-sm text-text-primary hover:bg-bg-row-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Rocket className="h-3.5 w-3.5" /> 发布
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
