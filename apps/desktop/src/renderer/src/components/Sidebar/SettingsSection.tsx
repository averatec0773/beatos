import React from "react";
import { Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { SidebarNavButton } from "@/components/Sidebar/SidebarNavButton";

export function SettingsSection(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname === "/settings";

  return (
    <SidebarNavButton
      icon={<Settings size={18} />}
      label={t("sidebar.settings")}
      active={active}
      onClick={() => {
        if (active) navigate(-1);
        else navigate("/settings");
      }}
      dataAttr="data-settings-link"
      ariaPressed={active}
    />
  );
}
