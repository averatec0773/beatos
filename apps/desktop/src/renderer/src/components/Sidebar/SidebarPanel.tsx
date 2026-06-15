import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { matchPath, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useListStore } from "@/stores/lists";
import { useTrackStore } from "@/stores/tracks";
import { useTrashStore } from "@/stores/trash";
import { SIDEBAR_COLLAPSED_WIDTH, useSidebarPanelStore } from "@/stores/sidebar-panel";

import { AllBeatsSection } from "@/components/Sidebar/AllBeatsSection";
import { ListsSection } from "@/components/Sidebar/ListsSection";
import { ApprovalsSection } from "@/components/Sidebar/ApprovalsSection";
import { TrashSection } from "@/components/Sidebar/TrashSection";
import { SettingsSection } from "@/components/Sidebar/SettingsSection";
import { SidebarFooter } from "@/components/Sidebar/SidebarFooter";
import { PublishCenterSection } from "@/components/Sidebar/PublishCenterSection";

export function SidebarPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const refreshLists = useListStore((s) => s.refresh);
  const refreshTrash = useTrashStore((s) => s.refresh);
  const refreshTotal = useTrackStore((s) => s.refreshTotal);

  const location = useLocation();
  const listRouteMatch = matchPath("/lists/:id", location.pathname);
  const activeListId = listRouteMatch ? Number(listRouteMatch.params.id) : null;

  useEffect(() => {
    refreshLists();
    void refreshTrash();
    void refreshTotal();
  }, [refreshLists, refreshTrash, refreshTotal]);

  const sidebarWidth = useSidebarPanelStore((s) => s.width);
  const collapsed = useSidebarPanelStore((s) => s.collapsed);
  const toggleCollapsed = useSidebarPanelStore((s) => s.toggleCollapsed);
  const width = collapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;

  return (
    <aside
      data-collapsed={collapsed ? "" : undefined}
      className="sidebar-panel beatos-card rounded-xl flex-shrink-0 overflow-y-auto py-3 flex flex-col gap-4 relative beatos-scroll"
      style={collapsed ? undefined : { width }}
    >
      {/* Header — mirrors the detail panel's: toggle on the LEFT, then the
          LIBRARY label (Spotify-style). Collapsed → just the centered toggle. */}
      <div className={collapsed ? "flex justify-center" : "flex items-center gap-2 px-3"}>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          className="text-text-tertiary hover:text-text-primary p-1.5 -ml-1 rounded-md hover:bg-bg-row-hover"
          data-sidebar-toggle
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        {!collapsed && <span className="beatos-eyebrow">{t("sidebar.library")}</span>}
      </div>
      <div className="flex flex-col gap-0.5">
        <AllBeatsSection />
        <PublishCenterSection />
        <ApprovalsSection />
        <TrashSection />
      </div>
      <ListsSection activeListId={activeListId} />
      <div className="mt-auto flex flex-col gap-0.5">
        <SidebarFooter />
        <SettingsSection />
      </div>
    </aside>
  );
}
