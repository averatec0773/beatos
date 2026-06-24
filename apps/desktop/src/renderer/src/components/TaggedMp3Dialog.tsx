import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiPostBlob } from "@/api/client";
import { assets as assetsApi, type Asset } from "@/api/assets";
import { useToastStore } from "@/stores/toast";
import { downloadBlob } from "@/lib/download-blob";

interface Props {
  open: boolean;
  trackId: number;
  onClose: () => void;
}

function variantLabel(role: string, t: TFunction): string {
  if (role === "audio_tagged") return t("dialogs.import.tagged");
  if (role === "audio_untagged") return t("dialogs.import.untagged");
  return role; // rarer audio roles (e.g. loop) — show the raw role
}

/**
 * "Tagged MP3" export: pick one of the track's MP3 variants (default the tagged
 * one) and download a copy with the catalog's ID3 tags + cover embedded. The
 * endpoint returns binary, so it uses apiPostBlob (not the JSON helpers); the
 * blob download works the same in Electron and the web build.
 */
export function TaggedMp3Dialog({ open, trackId, onClose }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Derive the MP3 variants in a memo (never inside a store selector — rule 4).
  const mp3Variants = useMemo(
    () => allAssets.filter((a) => a.format === "mp3" && !a.missing),
    [allAssets],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    assetsApi
      .listForTrack(trackId)
      .then((list) => {
        if (cancelled) return;
        setAllAssets(list);
        const mp3s = list.filter((a) => a.format === "mp3" && !a.missing);
        const tagged = mp3s.find((a) => a.role === "audio_tagged");
        setAssetId((tagged ?? mp3s[0])?.id ?? null);
      })
      .catch(() => !cancelled && setAllAssets([]));
    return () => {
      cancelled = true;
    };
  }, [open, trackId]);

  const canDownload = assetId != null && !busy;

  async function download(): Promise<void> {
    if (assetId == null) return;
    setBusy(true);
    try {
      const { blob, filename } = await apiPostBlob(`/api/tracks/${trackId}/tagged-mp3`, {
        asset_id: assetId,
      });
      downloadBlob(blob, filename || "track.mp3");
      useToastStore.getState().show("success", t("dialogs.taggedMp3.done"));
      onClose();
    } catch {
      useToastStore.getState().show("error", t("dialogs.taggedMp3.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogs.taggedMp3.title")}</DialogTitle>
          <DialogDescription>{t("dialogs.taggedMp3.desc")}</DialogDescription>
        </DialogHeader>

        {mp3Variants.length === 0 ? (
          <div className="py-4 text-sm text-text-secondary">{t("dialogs.taggedMp3.noMp3")}</div>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">{t("dialogs.taggedMp3.variant")}</span>
            <select
              value={assetId ?? ""}
              onChange={(e) => setAssetId(Number(e.target.value))}
              className="rounded-md border border-border-subtle bg-transparent px-2 py-1 text-sm w-full"
            >
              {mp3Variants.map((a) => (
                <option key={a.id} value={a.id}>
                  {variantLabel(a.role, t)}
                </option>
              ))}
            </select>
          </label>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={download}
            disabled={!canDownload}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? t("dialogs.taggedMp3.downloading") : t("dialogs.taggedMp3.download")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
