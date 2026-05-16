import React, { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { TopBar } from "@/components/TopBar";
import { SidebarPanel } from "@/routes/SidebarPanel";
import { useSourceStore } from "@/stores/sources";

export function AppShell(): React.JSX.Element {
  const sources = useSourceStore((s) => s.all);
  const hasLoaded = useSourceStore((s) => s.hasLoaded);
  const refresh = useSourceStore((s) => s.refresh);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasLoaded) refresh();
  }, [hasLoaded, refresh]);

  useEffect(() => {
    if (hasLoaded && sources.length === 0 && location.pathname !== "/welcome") {
      navigate("/welcome", { replace: true });
    }
  }, [hasLoaded, sources.length, location.pathname, navigate]);

  return (
    <div className="h-screen bg-bg-base text-text-primary flex flex-col">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <SidebarPanel />
        <main className="flex-1 flex overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
