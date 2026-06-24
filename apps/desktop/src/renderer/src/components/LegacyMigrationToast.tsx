import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { platform } from "@/platform";

/**
 * One-time, first-launch notice that BeatOS copied a legacy ~/Music/BeatOS
 * library into the app's data folder (the old copy is kept as a backup). The
 * main process emits this once the renderer is ready; web is a no-op.
 */
export function LegacyMigrationToast(): React.JSX.Element | null {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    return platform.onLegacyDbMigrated(() => setShown(true));
  }, []);

  if (!shown) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-accent bg-bg-elevated p-3 shadow-lg">
      <div className="text-sm font-semibold text-text-primary">{t("migration.title")}</div>
      <div className="mt-1 text-xs text-text-secondary">{t("migration.body")}</div>
      <button
        onClick={() => setShown(false)}
        className="mt-2 text-xs text-text-tertiary hover:text-text-primary"
      >
        {t("common.dismiss")}
      </button>
    </div>
  );
}
