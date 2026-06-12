import { beforeEach, describe, expect, it } from "vitest";

import { usePreviewPanelStore, PREVIEW_DEFAULT_WIDTH } from "../preview-panel";

describe("usePreviewPanelStore responsive auto-collapse", () => {
  beforeEach(() => {
    usePreviewPanelStore.setState({
      open: true,
      width: PREVIEW_DEFAULT_WIDTH,
      autoCollapsed: false,
    });
  });

  it("folds an open panel when the window goes narrow, and restores it when wide again", () => {
    const s = usePreviewPanelStore;
    s.getState().applyResponsive(true);
    expect(s.getState().open).toBe(false);
    expect(s.getState().autoCollapsed).toBe(true);

    s.getState().applyResponsive(false);
    expect(s.getState().open).toBe(true);
    expect(s.getState().autoCollapsed).toBe(false);
  });

  it("does NOT reopen a panel the user closed manually when the window widens", () => {
    const s = usePreviewPanelStore;
    s.getState().setOpen(false); // user closes it (wide)
    expect(s.getState().autoCollapsed).toBe(false);

    s.getState().applyResponsive(true); // narrow — already closed, no-op
    s.getState().applyResponsive(false); // wide again
    expect(s.getState().open).toBe(false); // stayed closed (respects manual intent)
  });

  it("clears the auto flag when the user manually toggles while folded", () => {
    const s = usePreviewPanelStore;
    s.getState().applyResponsive(true); // auto-folded
    expect(s.getState().autoCollapsed).toBe(true);

    s.getState().toggle(); // user expands while narrow
    expect(s.getState().open).toBe(true);
    expect(s.getState().autoCollapsed).toBe(false);
  });

  it("is a no-op when wide and the panel was never auto-collapsed", () => {
    const s = usePreviewPanelStore;
    s.getState().applyResponsive(false);
    expect(s.getState().open).toBe(true);
    expect(s.getState().autoCollapsed).toBe(false);
  });
});
