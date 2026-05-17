import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeyPickerPopover } from "../KeyPickerPopover";

describe("KeyPickerPopover", () => {
  it("renders Flat keys tab by default and shows Db/Eb/etc", () => {
    render(<KeyPickerPopover initialValue={null} onCommit={vi.fn()} onClear={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Flat keys")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Db" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bb" })).toBeTruthy();
  });

  it("switches to Sharp keys tab and shows F#/G#/etc", () => {
    render(<KeyPickerPopover initialValue={null} onCommit={vi.fn()} onClear={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Sharp keys"));
    expect(screen.getByRole("button", { name: "F#" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "G#" })).toBeTruthy();
  });

  it("seeds from initialValue and pre-selects the matching tab + note + mode", () => {
    render(<KeyPickerPopover initialValue="F# minor" onCommit={vi.fn()} onClear={vi.fn()} onClose={vi.fn()} />);
    // Sharp tab should be active — F# should appear as selected
    const fSharp = screen.getByRole("button", { name: "F#" });
    expect(fSharp.getAttribute("data-selected")).toBe("true");
    const minor = screen.getByRole("button", { name: "Minor" });
    expect(minor.getAttribute("data-selected")).toBe("true");
  });

  it("calls onCommit on close when both note and mode chosen", () => {
    const onCommit = vi.fn();
    const onClose = vi.fn();
    render(<KeyPickerPopover initialValue={null} onCommit={onCommit} onClear={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText("Sharp keys"));
    fireEvent.click(screen.getByRole("button", { name: "F#" }));
    fireEvent.click(screen.getByRole("button", { name: "Minor" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onCommit).toHaveBeenCalledWith("F# minor");
    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT call onCommit on close when only note chosen", () => {
    const onCommit = vi.fn();
    render(<KeyPickerPopover initialValue={null} onCommit={onCommit} onClear={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "F" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Clear calls onClear and onClose", () => {
    const onClear = vi.fn();
    const onClose = vi.fn();
    render(<KeyPickerPopover initialValue="F# minor" onCommit={vi.fn()} onClear={onClear} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
