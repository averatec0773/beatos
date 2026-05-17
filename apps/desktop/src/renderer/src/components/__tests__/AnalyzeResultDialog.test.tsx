import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnalyzeResultDialog } from "../AnalyzeResultDialog";
import type { AudioAnalysisResult } from "@/api/analysis";

// Mock Radix Dialog — render inline without portals
vi.mock("@radix-ui/react-dialog", async () => {
  const React = await import("react");

  function Root({ children, open, onOpenChange: _onOpenChange }: any) {
    if (!open) return null;
    return React.createElement("div", { "data-dialog-root": "true" }, children);
  }

  function Portal({ children }: any) {
    return React.createElement(React.Fragment, null, children);
  }

  function Overlay() {
    return null;
  }

  function Content({ children, ...props }: any) {
    return React.createElement("div", { "data-dialog-content": "true", ...props }, children);
  }

  function Title({ children }: any) {
    return React.createElement("h2", null, children);
  }

  function Description({ children }: any) {
    return React.createElement("p", null, children);
  }

  function Close({ children }: any) {
    return React.createElement(React.Fragment, null, children);
  }

  function Trigger({ children }: any) {
    return React.createElement(React.Fragment, null, children);
  }

  return { Root, Portal, Overlay, Content, Title, Description, Close, Trigger };
});

const RESULT_HIGH: AudioAnalysisResult = {
  asset_id: 1,
  sha256: "abc",
  bpm: 128.4,
  bpm_confidence: 0.87,
  key: "F# minor",
  key_confidence: 0.72,
  duration_seconds: 120,
  analyzed_at: "2026-05-17T00:00:00Z",
};

const RESULT_LOW_CONF: AudioAnalysisResult = {
  ...RESULT_HIGH,
  bpm_confidence: 0.5,
  key_confidence: 0.4,
};

const RESULT_NO_KEY: AudioAnalysisResult = {
  ...RESULT_HIGH,
  key: null,
  key_confidence: null,
};

function renderDialog(props: Partial<Parameters<typeof AnalyzeResultDialog>[0]> = {}) {
  const defaults = {
    open: true,
    result: RESULT_HIGH,
    currentBpm: null,
    currentKey: null,
    onApply: vi.fn(),
    onClose: vi.fn(),
  };
  return render(<AnalyzeResultDialog {...defaults} {...props} />);
}

describe("AnalyzeResultDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog content when open=true", () => {
    renderDialog({ open: true });
    expect(screen.getByText("Audio Analysis Results")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("Audio Analysis Results")).toBeNull();
  });

  it("defaults BPM checkbox checked when currentBpm is null and confidence >= 0.7", () => {
    renderDialog({ currentBpm: null, result: RESULT_HIGH });
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    // BPM checkbox (id=analyze-bpm-check) — checked because currentBpm null + conf 0.87 >= 0.7
    const bpmCb = checkboxes.find((cb) => cb.id === "analyze-bpm-check")!;
    expect(bpmCb.checked).toBe(true);
  });

  it("defaults BPM checkbox UNchecked when currentBpm is set (no replace existing)", () => {
    renderDialog({ currentBpm: 120, result: RESULT_HIGH });
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const bpmCb = checkboxes.find((cb) => cb.id === "analyze-bpm-check")!;
    expect(bpmCb.checked).toBe(false);
  });

  it("Replace existing toggle flips BPM checkbox default to checked when field populated", () => {
    renderDialog({ currentBpm: 120, result: RESULT_HIGH });
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const bpmCb = checkboxes.find((cb) => cb.id === "analyze-bpm-check")!;
    expect(bpmCb.checked).toBe(false);

    // Toggle Replace existing
    const replaceToggle = document.querySelector("[data-replace-existing]") as HTMLInputElement;
    fireEvent.click(replaceToggle);

    // Now BPM should be checked (conf 0.87 >= 0.7)
    expect(bpmCb.checked).toBe(true);
  });

  it("Apply with both BPM and Key checked calls onApply with both fields", () => {
    const onApply = vi.fn();
    renderDialog({ currentBpm: null, currentKey: null, result: RESULT_HIGH, onApply });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledWith({ bpm: 128, key_signature: "F# minor" });
  });

  it("Apply with only BPM checked calls onApply with bpm only", () => {
    const onApply = vi.fn();
    // currentKey is set -> key checkbox unchecked by default
    renderDialog({ currentBpm: null, currentKey: "C major", result: RESULT_HIGH, onApply });
    // BPM checked (empty), key unchecked (already set)
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const keyCb = checkboxes.find((cb) => cb.id === "analyze-key-check")!;
    expect(keyCb.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledWith({ bpm: 128 });
  });

  it("Apply with both unchecked calls onApply with empty patch", () => {
    const onApply = vi.fn();
    // Both fields populated -> both unchecked by default
    renderDialog({ currentBpm: 100, currentKey: "C major", result: RESULT_HIGH, onApply });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledWith({});
  });

  it("Cancel calls onClose and NOT onApply", () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onApply, onClose });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("BPM value is rounded to integer in display and patch", () => {
    const onApply = vi.fn();
    renderDialog({ currentBpm: null, result: RESULT_HIGH, onApply });
    // Display shows 128 (rounded from 128.4)
    expect(screen.getByText("128")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ bpm: 128 }));
  });

  it("shows low confidence warning when confidence below threshold", () => {
    renderDialog({ currentBpm: null, currentKey: null, result: RESULT_LOW_CONF });
    // Both BPM (0.5 < 0.7) and Key (0.4 < 0.6) have low confidence
    const warnings = screen.getAllByText(/⚠ Low/);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("disables Key row when result.key is null", () => {
    renderDialog({ result: RESULT_NO_KEY });
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const keyCb = checkboxes.find((cb) => cb.id === "analyze-key-check")!;
    expect(keyCb).toBeDisabled();
  });

  it("shows em-dash for null key value", () => {
    renderDialog({ result: RESULT_NO_KEY });
    // Should have a — in Key row
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("data-analyze-dialog attribute is present", () => {
    const { container } = renderDialog();
    expect(container.querySelector("[data-analyze-dialog]")).toBeInTheDocument();
  });
});
