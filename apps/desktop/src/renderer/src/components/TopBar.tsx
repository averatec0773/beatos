import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { SearchInput } from "@/components/SearchInput";
import { isMacElectron } from "@/platform";

// Routes where a back-button makes sense. The library root ("/" and
// "/lists/:id") never shows a back arrow — those are the home-level views
// users return *to*, not navigate back from.
function shouldShowBack(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/lists/")) return false;
  return true;
}

export function TopBar(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
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
      // `pt-3` (not `pb-2`) drops the bar's content by half the body's top
      // padding so the centred search box ends up equidistant from the window
      // top and the content cards below (measured: 64px bar + 12px body py-3
      // → centre at 38px). Left inset only on mac-Electron (traffic lights);
      // Windows uses a native title bar and the web build has no controls.
      className="relative z-50 h-16 flex-shrink-0 bg-transparent pr-3 pt-3 flex items-center gap-3 select-none"
      style={
        { paddingLeft: isMacElectron ? 88 : 16, WebkitAppRegion: "drag" } as React.CSSProperties
      }
    >
      <button
        type="button"
        onClick={() => navigate("/")}
        className="text-[17px] font-semibold tracking-tight hover:text-accent"
        aria-label={t("topbar.goAllBeats")}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        BeatOS
      </button>
      {showBack && (
        <>
          <div className="h-5 w-px bg-border-subtle" />
          <button
            type="button"
            onClick={handleBack}
            className="text-text-secondary hover:text-text-primary hover:bg-bg-row-hover p-1.5 -ml-1 rounded-md transition-colors"
            aria-label={t("topbar.back")}
            title={t("topbar.back")}
            data-topbar-back
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            <ArrowLeft size={18} strokeWidth={2.25} />
          </button>
        </>
      )}
      <div className="flex-1" />
      {/* Centered search — absolutely positioned so it sits in the true middle
          of the bar regardless of the left/right group widths (Spotify-style).
          `top` is the bar centre + half the body's top padding (6px) so the box
          is equidistant from the window top and the content below. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ top: "calc(50% + 6px)", WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <SearchInput />
      </div>
    </header>
  );
}
