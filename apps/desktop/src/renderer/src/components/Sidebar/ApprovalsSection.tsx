import React from "react";
import { Inbox } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { usePendingTokens } from "@/hooks/use-pending-tokens";
import { SidebarNavButton } from "@/components/Sidebar/SidebarNavButton";

export function ApprovalsSection(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { tokens } = usePendingTokens();
  const count = tokens.length;

  return (
    <SidebarNavButton
      icon={<Inbox size={20} />}
      label="Approvals"
      active={location.pathname === "/approvals"}
      onClick={() => navigate("/approvals")}
      dataAttr="data-approvals-link"
      collapsedDot={count > 0}
      trailing={
        count > 0 ? (
          <span
            className="min-w-[20px] h-[20px] px-1.5 inline-flex items-center justify-center rounded-full bg-warning text-[11px] font-semibold text-black"
            aria-label={`${count} pending`}
          >
            {count}
          </span>
        ) : undefined
      }
    />
  );
}
