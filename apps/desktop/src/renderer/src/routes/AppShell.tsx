import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";

import { TopBar } from "@/components/TopBar";
import { LibrarySidebar } from "@/components/LibrarySidebar";
import { useLibraryStore } from "@/stores/library";
import { OnboardingDriver } from "@/routes/OnboardingDriver";

export function AppShell(): React.JSX.Element {
  const active = useLibraryStore((s) => s.active);
  const loading = useLibraryStore((s) => s.loading);
  const refresh = useLibraryStore((s) => s.refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading && !active) {
    return (
      <div className="min-h-screen bg-bg-base text-text-secondary flex items-center justify-center">
        loading…
      </div>
    );
  }

  if (!active) {
    return <OnboardingDriver />;
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
    </div>
  );
}
