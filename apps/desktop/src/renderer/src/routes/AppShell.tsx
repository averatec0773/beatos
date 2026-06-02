import React from "react";
import { Outlet } from "react-router-dom";

import { TopBar } from "@/components/TopBar";
import { SidebarPanel } from "@/components/Sidebar/SidebarPanel";
import { BottomPlayerBar } from "@/components/BottomPlayerBar";
import { Toast } from "@/components/Toast";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import { GutterResizer } from "@/components/GutterResizer";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, useSidebarPanelStore } from "@/stores/sidebar-panel";

export function AppShell(): React.JSX.Element {
  const setSidebarWidth = useSidebarPanelStore((s) => s.setWidth);
  const sidebarCollapsed = useSidebarPanelStore((s) => s.collapsed);
  return (
    <div className="h-screen bg-bg-base text-text-primary flex flex-col">
      <TopBar />
      <AnalysisProgressBar />
      {/* Spotify-style canvas: pure-black gutter with the three regions floating
          as rounded cards, the resize handles living in the gutters between. */}
      <div className="flex-1 flex px-2 py-2 overflow-hidden min-h-0 bg-black">
        <SidebarPanel />
        {!sidebarCollapsed && (
          <GutterResizer
            ariaLabel="Resize sidebar"
            dataAttr="data-sidebar-resizer"
            getStartWidth={() => useSidebarPanelStore.getState().width}
            onResize={(w, dx) =>
              setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w + dx)))
            }
          />
        )}
        <main className="flex-1 flex overflow-hidden min-w-0">
          <Outlet />
        </main>
      </div>
      <BottomPlayerBar />
      <Toast />
    </div>
  );
}
