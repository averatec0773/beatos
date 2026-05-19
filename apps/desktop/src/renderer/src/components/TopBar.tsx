import React from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { TopBarRouteTitle } from "@/components/TopBarRouteTitle";
import { SearchInput } from "@/components/SearchInput";
import { usePreviewPanelStore } from "@/stores/preview-panel";

export function TopBar(): React.JSX.Element {
  const navigate = useNavigate();
  const previewOpen = usePreviewPanelStore((s) => s.open);
  const togglePreview = usePreviewPanelStore((s) => s.toggle);
  return (
    <header
      className="h-14 flex-shrink-0 border-b border-border-subtle pr-3 pb-2 flex items-center gap-3 select-none bg-bg-base"
      style={{ paddingLeft: "88px", WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={() => navigate("/")}
        className="text-[15px] font-semibold tracking-tight hover:text-accent"
        aria-label="Go to All Beats"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        BeatOS
      </button>
      <div className="h-5 w-px bg-border-subtle" />
      <TopBarRouteTitle />
      <div className="flex-1" />
      <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <SearchInput />
      </div>
      <button
        type="button"
        onClick={togglePreview}
        className="text-text-tertiary hover:text-text-primary p-1.5"
        aria-label={previewOpen ? "Hide preview panel" : "Show preview panel"}
        title={previewOpen ? "Hide preview" : "Show preview"}
        data-toggle-preview
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        {previewOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
      </button>
    </header>
  );
}
