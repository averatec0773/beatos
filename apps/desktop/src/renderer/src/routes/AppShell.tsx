import React, { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { TopBar } from "@/components/TopBar";
import { SidebarPanel } from "@/components/Sidebar/SidebarPanel";
import { BottomPlayerBar } from "@/components/BottomPlayerBar";
import { Toast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import { AsciiBackdrop } from "@/components/AsciiBackdrop";
import { UnicornBackdrop } from "@/components/UnicornBackdrop";
import { GutterResizer } from "@/components/GutterResizer";
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, useSidebarPanelStore } from "@/stores/sidebar-panel";
import { useAppearanceStore } from "@/stores/appearance";
import { useAgentPermissionStore } from "@/stores/agent-permission";
import { PREVIEW_AUTO_COLLAPSE_WIDTH, usePreviewPanelStore } from "@/stores/preview-panel";

export function AppShell(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSidebarWidth = useSidebarPanelStore((s) => s.setWidth);
  const sidebarCollapsed = useSidebarPanelStore((s) => s.collapsed);
  const agentMode = useAgentPermissionStore((s) => s.mode);
  const setAgentMode = useAgentPermissionStore((s) => s.setMode);

  // Panel translucency is a live appearance pref → drive the `--card-alpha`
  // CSS var (consumed by `.beatos-card`) from the store. Blur scales with
  // opacity so a more-transparent panel also un-blurs, letting the ASCII
  // backdrop read crisply through it instead of as mush.
  const cardOpacity = useAppearanceStore((s) => s.cardOpacity);
  const backdropStyle = useAppearanceStore((s) => s.backdropStyle);
  const backdropOpacity = useAppearanceStore((s) => s.backdropOpacity);
  useEffect(() => {
    const alpha = cardOpacity / 100;
    const root = document.documentElement.style;
    root.setProperty("--card-alpha", String(alpha));
    root.setProperty("--card-blur", `${(alpha * 14).toFixed(1)}px`);
  }, [cardOpacity]);
  // Backdrop translucency → the aurora/ascii layers read `--backdrop-opacity`.
  useEffect(() => {
    document.documentElement.style.setProperty("--backdrop-opacity", String(backdropOpacity / 100));
  }, [backdropOpacity]);

  // Responsive: fold the detail panel to its rail when the window is too narrow
  // to show it without crushing the track table, and restore the user's
  // preference when there's room again. matchMedia fires only on threshold
  // crossings (cheap), and we apply once on mount for a narrow initial size.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return; // jsdom guard
    const mq = window.matchMedia(`(max-width: ${PREVIEW_AUTO_COLLAPSE_WIDTH - 1}px)`);
    const apply = (): void => usePreviewPanelStore.getState().applyResponsive(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div
      data-backdrop={backdropStyle}
      className="app-canvas relative isolate h-screen text-text-primary flex flex-col overflow-hidden"
    >
      {/* Ambient backdrop, painted behind everything (z-0). The translucent
          `.beatos-card` columns float over it; gutters + the now transparent
          top bar reveal it directly. The user picks the style in Settings →
          Appearance: "aurora" (Unicorn WebGL field) or "ascii" (glyph-rain). */}
      {backdropStyle === "aurora" && <UnicornBackdrop />}
      {backdropStyle === "ascii" && <AsciiBackdrop />}
      <TopBar />
      {agentMode === "auto_approve" && (
        <div className="relative z-10 flex items-center justify-between gap-3 px-4 py-1.5 bg-warning/15 border-b border-warning/30 text-warning text-xs">
          <span>{t("banner.autoApprove.message")}</span>
          <button
            type="button"
            onClick={() => {
              void setAgentMode("confirm");
              void navigate("/settings");
            }}
            className="shrink-0 rounded border border-warning/40 px-2 py-0.5 hover:bg-warning/20"
          >
            {t("banner.autoApprove.dismiss")}
          </button>
        </div>
      )}
      <AnalysisProgressBar />
      {/* Spotify-style canvas: the three regions float as rounded cards over the
          backdrop, the resize handles (or a spacer when collapsed) living in the
          gutters between so the inter-card gap survives collapse. */}
      <div className="relative z-10 flex-1 flex px-2 py-2 overflow-hidden min-h-0">
        <SidebarPanel />
        {!sidebarCollapsed ? (
          <GutterResizer
            ariaLabel={t("sidebar.resizeSidebar")}
            dataAttr="data-sidebar-resizer"
            getStartWidth={() => useSidebarPanelStore.getState().width}
            onResize={(w, dx) =>
              setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, w + dx)))
            }
          />
        ) : (
          // Collapsed: no resizer, but keep the gutter width so the rail does
          // not sit flush against the middle card.
          <div className="w-2 shrink-0" aria-hidden />
        )}
        <main className="flex-1 flex overflow-hidden min-w-0">
          <Outlet />
        </main>
      </div>
      <BottomPlayerBar />
      <Toast />
      <ConfirmDialog />
    </div>
  );
}
