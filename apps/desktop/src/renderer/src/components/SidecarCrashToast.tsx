import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { platform } from "@/platform";

export function SidecarCrashToast(): React.JSX.Element | null {
  const { t } = useTranslation();
  const [info, setInfo] = useState<{ code: number | null; signal: string | null } | null>(null);

  useEffect(() => {
    return platform.onSidecarCrashed((i) => setInfo(i));
  }, []);

  if (!info) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-danger bg-bg-elevated p-3 shadow-lg">
      <div className="text-sm font-semibold text-danger">{t("errors.sidecarDisconnected")}</div>
      <div className="mt-1 text-xs text-text-secondary">
        {t("errors.sidecarExited", { code: String(info.code), signal: String(info.signal) })}
      </div>
      <button
        onClick={() => setInfo(null)}
        className="mt-2 text-xs text-text-tertiary hover:text-text-primary"
      >
        {t("common.dismiss")}
      </button>
    </div>
  );
}
