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
        label="发布中心"
        active={false}
        onClick={() =>
          useToastStore
            .getState()
            .show("info", "发布中心是 BeatOS Pro 功能,安装 Pro 模块后启用")
        }
        dataAttr="data-locked"
        trailing={<Lock size={14} className="text-text-tertiary" />}
      />
    );
  }

  return (
    <SidebarNavButton
      icon={<Rocket size={20} />}
      label="发布中心"
      active={active}
      onClick={() => navigate("/publish")}
      dataAttr="data-publish-center-link"
    />
  );
}
