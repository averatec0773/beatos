import React, { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { TopBar } from "@/components/TopBar";
import { SidebarPanel } from "@/components/Sidebar/SidebarPanel";
import { ApiErrorState } from "@/components/ApiErrorState";
import { BottomPlayerBar } from "@/components/BottomPlayerBar";
import { Toast } from "@/components/Toast";
import { useSourceStore } from "@/stores/sources";

export function AppShell(): React.JSX.Element {
  const sources = useSourceStore((s) => s.all);
  const hasLoaded = useSourceStore((s) => s.hasLoaded);
  const loadError = useSourceStore((s) => s.loadError);
  const refresh = useSourceStore((s) => s.refresh);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasLoaded) refresh();
  }, [hasLoaded, refresh]);

  useEffect(() => {
    if (hasLoaded && !loadError && sources.length === 0 && location.pathname !== "/welcome") {
      navigate("/welcome", { replace: true });
    }
  }, [hasLoaded, loadError, sources.length, location.pathname, navigate]);

  if (loadError) {
    return <ApiErrorState error={loadError} onRetry={() => refresh()} />;
  }

  return (
    <div className="h-screen bg-bg-base text-text-primary flex flex-col">
      <TopBar />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <SidebarPanel />
        <main className="flex-1 flex overflow-hidden min-w-0">
          <Outlet />
        </main>
      </div>
      <BottomPlayerBar />
      <Toast />
    </div>
  );
}
