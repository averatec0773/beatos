import React from "react";
import { useTranslation } from "react-i18next";
import { Rocket, Lock } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useProStore } from "@/stores/pro";
import { useToastStore } from "@/stores/toast";
import { SidebarNavButton } from "@/components/Sidebar/SidebarNavButton";

export function PublishCenterSection(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const proAvailable = useProStore((s) => s.publishAvailable);
  const active = location.pathname === "/publish";

  if (!proAvailable) {
    return (
      <SidebarNavButton
        icon={<Rocket size={20} />}
        label={t("sidebar.publishCenter")}
        active={false}
        onClick={() =>
          useToastStore
            .getState()
            .show("info", t("sidebar.publishCenterLocked"))
        }
        dataAttr="data-locked"
        trailing={<Lock size={14} className="text-text-tertiary" />}
      />
    );
  }

  return (
    <SidebarNavButton
      icon={<Rocket size={20} />}
      label={t("sidebar.publishCenter")}
      active={active}
      onClick={() => navigate("/publish")}
      dataAttr="data-publish-center-link"
    />
  );
}
