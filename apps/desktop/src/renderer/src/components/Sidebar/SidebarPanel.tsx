import React, { useEffect, useRef } from "react";
import { matchPath, useLocation } from "react-router-dom";

import { useSourceStore } from "@/stores/sources";
import { useListStore } from "@/stores/lists";
import { useTrashStore } from "@/stores/trash";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarPanelStore,
} from "@/stores/sidebar-panel";

import { SourcesSection } from "@/components/Sidebar/SourcesSection";
import { ListsSection } from "@/components/Sidebar/ListsSection";
import { ApprovalsSection } from "@/components/Sidebar/ApprovalsSection";
import { TrashSection } from "@/components/Sidebar/TrashSection";
import { SidebarFooter } from "@/components/Sidebar/SidebarFooter";

function SidebarResizer(): React.JSX.Element {
  const setWidth = useSidebarPanelStore((s) => s.setWidth);
  const startRef = useRef<{ startX: number; startWidth: number } | null>(null);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    startRef.current = {
      startX: e.clientX,
      startWidth: useSidebarPanelStore.getState().width,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const s = startRef.current;
    if (!s) return;
    const next = s.startWidth + (e.clientX - s.startX);
    setWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next)));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (!startRef.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    startRef.current = null;
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize hover:bg-accent/40 z-10"
      data-sidebar-resizer
    />
  );
}

export function SidebarPanel(): React.JSX.Element {
  const refreshSources = useSourceStore((s) => s.refresh);
  const refreshLists = useListStore((s) => s.refresh);
  const refreshTrash = useTrashStore((s) => s.refresh);

  const location = useLocation();
  const listRouteMatch = matchPath("/lists/:id", location.pathname);
  const activeListId = listRouteMatch ? Number(listRouteMatch.params.id) : null;
  const onListRoute = activeListId != null;

  useEffect(() => {
    refreshSources();
    refreshLists();
    void refreshTrash();
    const id = setInterval(() => refreshSources(), 5000);
    return () => clearInterval(id);
  }, [refreshSources, refreshLists, refreshTrash]);

  const sidebarWidth = useSidebarPanelStore((s) => s.width);

  return (
    <aside
      className="flex-shrink-0 border-r border-border-subtle overflow-y-auto py-3 flex flex-col gap-4 relative"
      style={{ width: sidebarWidth }}
    >
      <SidebarResizer />
      <SourcesSection onListRoute={onListRoute} />
      <ListsSection activeListId={activeListId} />
      <ApprovalsSection />
      <TrashSection />
      <SidebarFooter />
    </aside>
  );
}
