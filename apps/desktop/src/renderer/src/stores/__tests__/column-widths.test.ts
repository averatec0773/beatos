import { beforeEach, describe, expect, it } from "vitest";
import { useColumnWidthStore } from "../column-widths";

const DEFAULTS = {
  title: 0,
  bpm: 80,
  key: 96,
  genre: 144,
  updated: 96,
};

beforeEach(() => {
  useColumnWidthStore.getState().resetAll();
});

describe("useColumnWidthStore defaults", () => {
  it("default state matches DEFAULTS", () => {
    expect(useColumnWidthStore.getState().widths).toEqual(DEFAULTS);
  });
});

describe("setWidth", () => {
  it("setWidth('bpm', 100) updates bpm to 100", () => {
    useColumnWidthStore.getState().setWidth("bpm", 100);
    expect(useColumnWidthStore.getState().widths.bpm).toBe(100);
  });

  it("setWidth('bpm', 10) clamps to MIN_WIDTH['bpm'] = 48", () => {
    useColumnWidthStore.getState().setWidth("bpm", 10);
    expect(useColumnWidthStore.getState().widths.bpm).toBe(48);
  });

  it("setWidth('title', 200) updates title to 200", () => {
    useColumnWidthStore.getState().setWidth("title", 200);
    expect(useColumnWidthStore.getState().widths.title).toBe(200);
  });

  it("setWidth('title', 50) clamps to MIN_WIDTH['title'] = 80", () => {
    useColumnWidthStore.getState().setWidth("title", 50);
    expect(useColumnWidthStore.getState().widths.title).toBe(80);
  });

  it("does not mutate other columns when one is changed", () => {
    useColumnWidthStore.getState().setWidth("bpm", 120);
    const w = useColumnWidthStore.getState().widths;
    expect(w.key).toBe(96);
    expect(w.genre).toBe(144);
    expect(w.updated).toBe(96);
  });
});

describe("resetAll", () => {
  it("resetAll restores defaults after mutations", () => {
    useColumnWidthStore.getState().setWidth("bpm", 200);
    useColumnWidthStore.getState().setWidth("genre", 300);
    useColumnWidthStore.getState().resetAll();
    expect(useColumnWidthStore.getState().widths).toEqual(DEFAULTS);
  });
});
