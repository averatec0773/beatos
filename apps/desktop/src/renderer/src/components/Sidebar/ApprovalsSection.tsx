import React from "react";
import { Inbox } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { SidebarNavButton } from "@/components/Sidebar/SidebarNavButton";

export function ApprovalsSection(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <SidebarNavButton
      icon={<Inbox size={18} />}
      label={t("sidebar.agentActions")}
      active={location.pathname === "/approvals"}
      onClick={() => navigate("/approvals")}
      dataAttr="data-approvals-link"
    />
  );
}
