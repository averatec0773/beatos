import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { TableHeader } from "@/components/TableHeader";
import { useColumnWidthStore } from "@/stores/column-widths";

// Regression guard for the long-standing "drag a fixed column right → the
// columns to its left slide left" bug. Root cause: `title` is the flexible
// `1fr` track sitting left of bpm/key/genre, so growing a fixed column steals
// width from title. Fix: freeze title to its rendered px the moment a fixed
// column resize starts (TableHeader.freezeTitle + ColumnResizer.onResizeStart).
// jsdom has no layout, so getBoundingClientRect is stubbed to a real width.
const TITLE_RENDERED_WIDTH = 320;

beforeEach(() => {
  useColumnWidthStore.getState().resetAll();
  // jsdom implements neither — the resizer calls setPointerCapture on pointerdown.
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: TITLE_RENDERED_WIDTH,
    height: 36,
    top: 0,
    left: 0,
    right: TITLE_RENDERED_WIDTH,
    bottom: 36,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function pointerDown(el: Element): void {
  el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
}

describe("TableHeader column resize — title freeze", () => {
  it("title starts flexible (width 0)", () => {
    render(<TableHeader />);
    expect(useColumnWidthStore.getState().widths.title).toBe(0);
  });

  it("starting a genre resize freezes title to its rendered px", () => {
    const { container } = render(<TableHeader />);
    const genreResizer = container.querySelector('[data-column-resizer="genre"]');
    expect(genreResizer).not.toBeNull();
    pointerDown(genreResizer!);
    expect(useColumnWidthStore.getState().widths.title).toBe(TITLE_RENDERED_WIDTH);
  });

  it("starting a key resize also freezes title", () => {
    const { container } = render(<TableHeader />);
    pointerDown(container.querySelector('[data-column-resizer="key"]')!);
    expect(useColumnWidthStore.getState().widths.title).toBe(TITLE_RENDERED_WIDTH);
  });

  it("does not re-freeze title once it is already fixed", () => {
    const { container } = render(<TableHeader />);
    useColumnWidthStore.getState().setWidth("title", 200);
    pointerDown(container.querySelector('[data-column-resizer="genre"]')!);
    // freezeTitle only acts when title === 0; an already-sized title is left alone.
    expect(useColumnWidthStore.getState().widths.title).toBe(200);
  });
});
