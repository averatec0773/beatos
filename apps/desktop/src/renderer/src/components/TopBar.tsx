import React from "react";
import { ArrowLeft, PanelRightOpen, PanelRightClose } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { TopBarRouteTitle } from "@/components/TopBarRouteTitle";
import { SearchInput } from "@/components/SearchInput";
import { usePreviewPanelStore } from "@/stores/preview-panel";

// Routes where a back-button makes sense. The library root ("/" and
// "/lists/:id") never shows a back arrow — those are the home-level views
// users return *to*, not navigate back from.
function shouldShowBack(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/lists/")) return false;
  return true;
}

export function TopBar(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const previewOpen = usePreviewPanelStore((s) => s.open);
  const togglePreview = usePreviewPanelStore((s) => s.toggle);
  const showBack = shouldShowBack(location.pathname);

  // history.state.idx is react-router's internal index; null when this is
  // the first entry (user opened the app and deep-linked here, e.g. via a
  // reload while on /tracks/N/edit). In that case `navigate(-1)` would
  // bounce out of the app — fall back to "/" instead. NaN is a known
  // react-router HashRouter quirk (remix-run/react-router#10964) — gate on
  // Number.isFinite so a NaN idx routes to "/" rather than navigate(-1).
  const handleBack = (): void => {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (idx == null || !Number.isFinite(idx) || idx <= 0) navigate("/");
    else navigate(-1);
  };

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
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          className="text-text-secondary hover:text-text-primary hover:bg-bg-row-hover p-1.5 -ml-1 rounded-md transition-colors"
          aria-label="Back"
          title="Back"
          data-topbar-back
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <ArrowLeft size={18} strokeWidth={2.25} />
        </button>
      )}
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
