import React from "react";
import { Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { TopBarRouteTitle } from "@/components/TopBarRouteTitle";
import { SearchInput } from "@/components/SearchInput";

export function TopBar(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <header
      className="h-12 flex-shrink-0 border-b border-border-subtle px-3 flex items-center gap-3 select-none bg-bg-base"
      style={{ paddingLeft: "84px" }}
    >
      <button
        type="button"
        onClick={() => navigate("/")}
        className="text-sm font-semibold tracking-tight hover:text-accent"
        aria-label="Go to All Beats"
      >
        BeatOS
      </button>
      <div className="h-4 w-px bg-border-subtle" />
      <TopBarRouteTitle />
      <div className="flex-1" />
      <SearchInput />
      <button
        type="button"
        onClick={() => navigate("/settings")}
        className="text-text-tertiary hover:text-text-primary p-1.5"
        aria-label="Settings"
      >
        <Settings size={16} />
      </button>
    </header>
  );
}
