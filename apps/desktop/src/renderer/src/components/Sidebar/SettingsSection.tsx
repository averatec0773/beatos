import React from "react";
import { Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { SidebarNavButton } from "@/components/Sidebar/SidebarNavButton";

export function SettingsSection(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const active = location.pathname === "/settings";

  return (
    <SidebarNavButton
      icon={<Settings size={20} />}
      label="Settings"
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
