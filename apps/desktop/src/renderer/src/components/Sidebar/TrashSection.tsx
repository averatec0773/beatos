import React from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useTrashStore } from "@/stores/trash";
import { SidebarNavButton } from "@/components/Sidebar/SidebarNavButton";

export function TrashSection(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const trashCount = useTrashStore((s) => s.list.length);

  return (
    <SidebarNavButton
      icon={<Trash2 size={18} />}
      label={t("sidebar.trash")}
      active={location.pathname === "/trash"}
      onClick={() => navigate("/trash")}
      dataAttr="data-trash-link"
      trailing={
        trashCount > 0 ? (
          <span className="font-mono text-[12px] tabular-nums text-text-tertiary">
            {trashCount}
          </span>
        ) : undefined
      }
    />
  );
}
