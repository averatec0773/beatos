import React from "react";
import { CheckCircle2, AlertCircle, CircleDashed, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SessionState } from "@/api/publish";

const PLATFORM_LABEL: Record<string, string> = { netease: "NetEase" };

interface Props {
  platform: string;
  state: SessionState;
  loggingIn: boolean;
  onLogin: () => void;
}

export function SessionHealthRow({
  platform,
  state,
  loggingIn,
  onLogin,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const label = PLATFORM_LABEL[platform] ?? platform;
  return (
    <div className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-elevated px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-primary">{label}</span>
        <Badge state={state} />
      </div>
      <button
        type="button"
        disabled={loggingIn || state === "checking"}
        onClick={onLogin}
        className="rounded-md border border-border-subtle px-2.5 py-1 text-xs text-text-secondary hover:bg-bg-row-hover disabled:opacity-50"
      >
        {loggingIn
          ? t("publishCenter.browserOpenFinishLogin")
          : state === "valid"
            ? t("publishCenter.reLogin")
            : t("publishCenter.logIn")}
      </button>
    </div>
  );
}

function Badge({ state }: { state: SessionState }): React.JSX.Element {
  const { t } = useTranslation();
  switch (state) {
    case "valid":
      return (
        <span className="flex items-center gap-1 text-xs text-success">
          <CheckCircle2 size={13} /> {t("publishCenter.loggedIn")}
        </span>
      );
    case "expired":
      return (
        <span className="flex items-center gap-1 text-xs text-danger">
          <AlertCircle size={13} /> {t("publishCenter.expired")}
        </span>
      );
    case "checking":
      return (
        <span className="flex items-center gap-1 text-xs text-text-tertiary">
          <Loader2 size={13} className="animate-spin" /> {t("publishCenter.checking")}
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-xs text-text-tertiary">
          <CircleDashed size={13} /> {t("publishCenter.notLoggedIn")}
        </span>
      );
  }
}
