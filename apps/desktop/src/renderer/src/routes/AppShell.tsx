import React from "react";
import { Outlet } from "react-router-dom";

import { TopBar } from "@/components/TopBar";
import { SidebarPanel } from "@/components/Sidebar/SidebarPanel";
import { BottomPlayerBar } from "@/components/BottomPlayerBar";
import { Toast } from "@/components/Toast";

export function AppShell(): React.JSX.Element {
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
