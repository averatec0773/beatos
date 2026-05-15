import React from "react";
import { Outlet } from "react-router-dom";

import { TopBar } from "@/components/TopBar";
import { SidebarPanel } from "@/routes/SidebarPanel";

export function AppShell(): React.JSX.Element {
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
