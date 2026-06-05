import React from "react";
import { useTranslation } from "react-i18next";
import { Music } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useTrackStore } from "@/stores/tracks";
import { SidebarNavButton } from "@/components/Sidebar/SidebarNavButton";

export function AllBeatsSection(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const count = useTrackStore((s) => s.total);
  const active = location.pathname === "/";

  return (
    <SidebarNavButton
      icon={<Music size={20} />}
      label={t("sidebar.allBeats")}
      active={active}
      onClick={() => navigate("/")}
      dataAttr="data-all-beats-link"
      trailing={
        count != null && count > 0 ? (
          <span className="font-mono text-[12px] tabular-nums text-text-tertiary">{count}</span>
        ) : undefined
      }
    />
  );
}
