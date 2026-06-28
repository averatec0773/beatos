import React from "react";
import { MessagesSquare } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { SidebarNavButton } from "@/components/Sidebar/SidebarNavButton";

export function ChatSection(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <SidebarNavButton
      icon={<MessagesSquare size={18} />}
      label={t("sidebar.aiChat")}
      active={location.pathname === "/chat"}
      onClick={() => navigate("/chat")}
      dataAttr="data-chat-link"
    />
  );
}
