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
  uploading_audio: "上传音频",
  uploading_cover: "上传封面",
  filling_metadata: "填写元数据",
  submitting: "提交中",
  done: "已完成",
  failed: "失败",
};

const AUDIO_ROLE_PRIORITY = [
  "audio_untagged_wav",
  "audio_untagged_mp3",
  "audio_tagged_wav",
  "audio_tagged_mp3",
];

function isAudioRole(role: string): boolean {
  return role.startsWith("audio_");
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
  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [job, setJob] = useState<PublishJob | null>(null);
  const [publishing, setPublishing] = useState(false);
  const pollRef = useRef<number | null>(null);

  const audioAssets = useMemo(
    () => trackAssets.filter((a) => isAudioRole(a.role)),
    [trackAssets],
  );
  const coverAssets = useMemo(
    () => trackAssets.filter((a) => a.role === "cover"),
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
        const audio =
          AUDIO_ROLE_PRIORITY.map((role) => list.find((a) => a.role === role)).find(Boolean) ??
          list.find((a) => isAudioRole(a.role));
        if (audio) setAudioAssetId(audio.id);
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
      useToastStore.getState().show("warning", "请先选择音频文件");
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
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            音频文件
            <select
              aria-label="音频文件"
              value={audioAssetId ?? ""}
              onChange={(e) => setAudioAssetId(e.target.value ? Number(e.target.value) : null)}
              disabled={audioAssets.length === 0}
              className="rounded-md border border-border-subtle bg-transparent px-2 py-1 text-sm text-text-primary disabled:opacity-40"
            >
              {audioAssets.length === 0 && <option value="">无可用音频</option>}
              {audioAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.role} — {a.rel_path ?? a.abs_path.split("/").pop()}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            封面（可选）
            <select
              aria-label="封面"
              value={coverAssetId ?? ""}
              onChange={(e) => setCoverAssetId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-md border border-border-subtle bg-transparent px-2 py-1 text-sm text-text-primary"
            >
              <option value="">无封面</option>
              {coverAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.rel_path ?? a.abs_path.split("/").pop()}
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
