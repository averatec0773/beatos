import React from "react";
import { Inbox } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { usePendingTokens } from "@/hooks/use-pending-tokens";

export function ApprovalsSection(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { tokens } = usePendingTokens();
  const count = tokens.length;

  return (
    <button
      type="button"
      data-approvals-link
      onClick={() => navigate("/approvals")}
      className={[
        "w-full px-3 py-1.5 text-left text-[15px] rounded-md flex items-center gap-2",
        location.pathname === "/approvals"
          ? "bg-bg-row-active text-accent"
          : "text-text-primary hover:bg-bg-row-hover",
      ].join(" ")}
    >
      <Inbox size={14} />
      <span className="flex-1">Approvals</span>
      {count > 0 && (
        <span
          className="min-w-[20px] h-[20px] px-1.5 inline-flex items-center justify-center rounded-full bg-warning text-[11px] font-semibold text-black"
          aria-label={`${count} pending`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
