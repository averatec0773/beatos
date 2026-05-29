import { describe, it, expect } from "vitest";
import { formatPlayerSubtitle, formatTime } from "../format-player";

describe("formatPlayerSubtitle", () => {
  it("all fields present", () => {
    expect(formatPlayerSubtitle({ producer: "x", bpm: 140, key: "F#m" })).toBe("x · 140 BPM · F#m");
  });
  it("uses em-dash placeholder for missing fields", () => {
    expect(formatPlayerSubtitle({ producer: null, bpm: 140, key: null })).toBe("— · 140 BPM · —");
  });
  it("all missing", () => {
    expect(formatPlayerSubtitle({ producer: null, bpm: null, key: null })).toBe("— · — BPM · —");
  });
  it("sorts producer array alphabetically", () => {
    expect(formatPlayerSubtitle({ producer: ["yusician", "averatec"], bpm: 136, key: "Gbm" })).toBe(
      "averatec, yusician · 136 BPM · Gbm",
    );
  });
});

describe("formatTime", () => {
  it("formats seconds as m:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3600)).toBe("60:00");
  });
  it("clamps NaN/negatives to 0:00", () => {
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(-5)).toBe("0:00");
  });
});
