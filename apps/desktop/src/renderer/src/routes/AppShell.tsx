import React, { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";

import { TopBar } from "@/components/TopBar";
import { LibrarySidebar } from "@/components/LibrarySidebar";
import { FirstScanModal } from "@/components/FirstScanModal";
import { useLibraryStore } from "@/stores/library";

export function AppShell(): React.JSX.Element {
  const active = useLibraryStore((s) => s.active);
  const loading = useLibraryStore((s) => s.loading);
  const refresh = useLibraryStore((s) => s.refresh);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!loading && !active && location.pathname !== "/welcome") {
      navigate("/welcome", { replace: true });
    }
  }, [loading, active, location.pathname, navigate]);

  if (loading && !active) {
    return (
      <div className="min-h-screen bg-bg-base text-text-secondary flex items-center justify-center">
        loading…
      </div>
    );
  }

  if (!active) {
    // Render nothing while the effect navigates us to /welcome
    return <div className="min-h-screen bg-bg-base" />;
  }

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex flex-col">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <LibrarySidebar />
        <main className="flex-1 flex overflow-hidden">
          <Outlet />
        </main>
      </div>
      <FirstScanModal />
    </div>
  );
}
