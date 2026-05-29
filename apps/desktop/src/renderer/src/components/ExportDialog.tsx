import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { exportApi, type ExportField, type ExportResult } from "@/api/export";
import { useToastStore } from "@/stores/toast";

interface Props {
  open: boolean;
  trackId: number;
  onClose: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="复制"
      disabled={!text}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-xs text-text-primary hover:bg-bg-row-hover disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function FieldRow({ field }: { field: ExportField }) {
  if (field.options.length > 0) {
    return (
      <div className="flex flex-col gap-1 py-2 border-b border-border-subtle">
        <div className="text-xs text-text-secondary">{field.label}</div>
        <div className="flex flex-wrap gap-2">
          {field.options.map((opt) => (
            <div key={opt} className="inline-flex items-center gap-1">
              <span className="text-sm">{opt}</span>
              <CopyButton text={opt} />
            </div>
          ))}
        </div>
        {field.note && <div className="text-xs text-warning">{field.note}</div>}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border-subtle">
      <div className="w-16 shrink-0 text-xs text-text-secondary pt-1">{field.label}</div>
      <div className="flex-1 whitespace-pre-wrap text-sm">
        {field.value || <span className="text-text-tertiary">—</span>}
      </div>
      <CopyButton text={field.value} />
      {field.note && <div className="text-xs text-warning">{field.note}</div>}
    </div>
  );
}

export function ExportDialog({ open, trackId, onClose }: Props) {
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [platform, setPlatform] = useState<string>("netease");
  const [result, setResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    if (!open) return;
    exportApi.platforms().then((p) => {
      setPlatforms(p.platforms);
      if (p.platforms.length && !p.platforms.includes(platform)) setPlatform(p.platforms[0]);
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    exportApi
      .forTrack(trackId, platform)
      .then((r) => !cancelled && setResult(r))
      .catch(() => {
        if (!cancelled) useToastStore.getState().show("error", "导出失败");
      });
    return () => {
      cancelled = true;
    };
  }, [open, trackId, platform]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导出元数据</DialogTitle>
          <DialogDescription>逐字段复制到平台上传表单。</DialogDescription>
        </DialogHeader>
        <div className="mb-2">
          <select
            aria-label="平台"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="rounded-md border border-border-subtle bg-transparent px-2 py-1 text-sm"
          >
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="max-h-[60vh] overflow-y-auto beatos-scroll">
          {result?.fields.map((f) => (
            <FieldRow key={f.key} field={f} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
