import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiPostBlob } from "@/api/client";
import { licenseTiers, type LicenseTier } from "@/api/license-tiers";
import { useToastStore } from "@/stores/toast";
import { downloadBlob } from "@/lib/download-blob";
// Language display names live here (in their own script) so component files stay
// free of raw CJK literals — the no-hardcoded-cjk guard scans components/+routes/.
import { LANGUAGE_LABELS } from "@/i18n/resources";

interface Props {
  open: boolean;
  trackId: number;
  onClose: () => void;
}

function tierLabel(tier: LicenseTier): string {
  return tier.name || tier.deliverables.join(" / ") || `#${tier.id}`;
}

/**
 * "Generate license" flow: pick a tier + buyer (+ optional price/date/exclusive/
 * language), POST to the license-pdf route, and download the returned PDF. The
 * endpoint returns binary, so it uses apiPostBlob (not the JSON helpers); the
 * blob download works the same in Electron and the web build.
 */
export function LicenseDialog({ open, trackId, onClose }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [tiers, setTiers] = useState<LicenseTier[]>([]);
  const [tierId, setTierId] = useState<number | null>(null);
  const [buyer, setBuyer] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [lang, setLang] = useState("en");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    licenseTiers
      .listForTrack(trackId)
      .then((ts) => {
        if (cancelled) return;
        setTiers(ts);
        setTierId(ts.length ? ts[0].id : null);
      })
      .catch(() => !cancelled && setTiers([]));
    return () => {
      cancelled = true;
    };
  }, [open, trackId]);

  const canGenerate = tierId != null && buyer.trim().length > 0 && !busy;

  async function generate(): Promise<void> {
    if (tierId == null || !buyer.trim()) return;
    setBusy(true);
    try {
      const { blob, filename } = await apiPostBlob(`/api/tracks/${trackId}/license-pdf`, {
        tier_id: tierId,
        buyer: buyer.trim(),
        exclusive,
        price: price.trim() || null,
        date: date || null,
        lang,
      });
      downloadBlob(blob, filename || "license.pdf");
      useToastStore.getState().show("success", t("dialogs.license.done"));
      onClose();
    } catch {
      useToastStore.getState().show("error", t("dialogs.license.failed"));
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "rounded-md border border-border-subtle bg-transparent px-2 py-1 text-sm w-full";
  const labelCls = "text-xs text-text-secondary";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogs.license.title")}</DialogTitle>
          <DialogDescription>{t("dialogs.license.desc")}</DialogDescription>
        </DialogHeader>

        {tiers.length === 0 ? (
          <div className="py-4 text-sm text-text-secondary">{t("dialogs.license.noTiers")}</div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("dialogs.license.tier")}</span>
              <select
                value={tierId ?? ""}
                onChange={(e) => setTierId(Number(e.target.value))}
                className={inputCls}
              >
                {tiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tierLabel(tier)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className={labelCls}>{t("dialogs.license.buyer")}</span>
              <input
                value={buyer}
                onChange={(e) => setBuyer(e.target.value)}
                placeholder={t("dialogs.license.buyerPlaceholder")}
                className={inputCls}
              />
            </label>

            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className={labelCls}>{t("dialogs.license.price")}</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={t("dialogs.license.pricePlaceholder")}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className={labelCls}>{t("dialogs.license.date")}</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={exclusive}
                  onChange={(e) => setExclusive(e.target.checked)}
                />
                {t("dialogs.license.exclusive")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <span className={labelCls}>{t("dialogs.license.language")}</span>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  className="rounded-md border border-border-subtle bg-transparent px-2 py-1 text-sm"
                >
                  <option value="en">{LANGUAGE_LABELS.en}</option>
                  <option value="zh">{LANGUAGE_LABELS.zh}</option>
                </select>
              </label>
            </div>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={generate}
            disabled={!canGenerate}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? t("dialogs.license.generating") : t("dialogs.license.generate")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
