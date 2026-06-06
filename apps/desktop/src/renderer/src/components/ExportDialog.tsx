import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Rocket } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { exportApi, type ExportField, type ExportResult } from "@/api/export";
import { useToastStore } from "@/stores/toast";
import { useProStore } from "@/stores/pro";
import { PublishDialog } from "@/components/PublishDialog";

interface Props {
  open: boolean;
  trackId: number;
  onClose: () => void;
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={t("dialogs.export.copyAria")}
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
  const { t } = useTranslation();
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [platform, setPlatform] = useState<string>("netease");
  const [result, setResult] = useState<ExportResult | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  // Select the boolean directly (no derivation inside the selector — rule 4).
  const publishAvailable = useProStore((s) => s.publishAvailable);

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
    setResult(null);
    exportApi
      .forTrack(trackId, platform)
      .then((r) => !cancelled && setResult(r))
      .catch(() => {
        if (!cancelled) useToastStore.getState().show("error", t("dialogs.export.failed"));
      });
    return () => {
      cancelled = true;
    };
  }, [open, trackId, platform]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogs.export.title")}</DialogTitle>
          <DialogDescription>{t("dialogs.export.desc")}</DialogDescription>
        </DialogHeader>
        <div className="mb-2 flex items-center gap-2">
          <select
            aria-label={t("dialogs.export.platformAria")}
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
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            disabled={!publishAvailable || platforms.length === 0}
            title={publishAvailable ? undefined : t("dialogs.export.proLocked")}
            className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-sm text-text-primary hover:bg-bg-row-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Rocket className="h-3.5 w-3.5" /> {t("dialogs.export.publish")}
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto beatos-scroll">
          {result?.fields.map((f) => (
            <FieldRow key={f.key} field={f} />
          ))}
        </div>
        {publishAvailable && (
          <PublishDialog
            open={publishOpen}
            trackId={trackId}
            platform={platform}
            onClose={() => setPublishOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
