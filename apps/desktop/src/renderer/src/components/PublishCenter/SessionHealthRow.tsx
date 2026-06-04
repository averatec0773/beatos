import React from "react";
import { CheckCircle2, AlertCircle, CircleDashed, Loader2 } from "lucide-react";

import type { SessionState } from "@/api/publish";

const PLATFORM_LABEL: Record<string, string> = { netease: "网易云音乐" };

interface Props {
  platform: string;
  state: SessionState;
  loggingIn: boolean;
  onLogin: () => void;
}

export function SessionHealthRow({ platform, state, loggingIn, onLogin }: Props): React.JSX.Element {
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
        {loggingIn ? "浏览器已打开,请完成登录…" : state === "valid" ? "重新登录" : "登录"}
      </button>
    </div>
  );
}

function Badge({ state }: { state: SessionState }): React.JSX.Element {
  switch (state) {
    case "valid":
      return (
        <span className="flex items-center gap-1 text-xs text-success">
          <CheckCircle2 size={13} /> 已登录
        </span>
      );
    case "expired":
      return (
        <span className="flex items-center gap-1 text-xs text-error">
          <AlertCircle size={13} /> 已过期 · 点此重新登录
        </span>
      );
    case "checking":
      return (
        <span className="flex items-center gap-1 text-xs text-text-tertiary">
          <Loader2 size={13} className="animate-spin" /> 校验中
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-xs text-text-tertiary">
          <CircleDashed size={13} /> 未登录
        </span>
      );
  }
}
