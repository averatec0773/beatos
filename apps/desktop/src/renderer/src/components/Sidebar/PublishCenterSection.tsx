import React from "react";
import { Rocket, Lock } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useProStore } from "@/stores/pro";
import { useToastStore } from "@/stores/toast";
import { SidebarNavButton } from "@/components/Sidebar/SidebarNavButton";

export function PublishCenterSection(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const proAvailable = useProStore((s) => s.publishAvailable);
  const active = location.pathname === "/publish";

  if (!proAvailable) {
    return (
      <SidebarNavButton
        icon={<Rocket size={20} />}
        label="Publish Center"
        active={false}
        onClick={() =>
          useToastStore
            .getState()
            .show("info", "Publish Center is a BeatOS Pro feature — install the Pro module to enable it.")
        }
        dataAttr="data-locked"
        trailing={<Lock size={14} className="text-text-tertiary" />}
      />
    );
  }

  return (
    <SidebarNavButton
      icon={<Rocket size={20} />}
      label="Publish Center"
      active={active}
      onClick={() => navigate("/publish")}
      dataAttr="data-publish-center-link"
    />
  );
}
