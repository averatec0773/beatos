import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownLite } from "@/lib/markdown-lite";

function markers(container: HTMLElement): (string | undefined)[] {
  return Array.from(container.querySelectorAll("ol > li > div:first-child > span:first-child")).map(
    (n) => n.textContent?.trim(),
  );
}

describe("MarkdownLite ordered lists", () => {
  it("numbers sequentially when sub-bullets separate the items (the beat-listing case)", () => {
    const text = [
      "1. **契约** (ID: 24)",
      "- BPM: 152",
      "- 风格: Melodic Rap",
      "",
      "2. **寒江雪** (ID: 6)",
      "- BPM: 137",
    ].join("\n");
    const { container } = render(<MarkdownLite text={text} />);
    // One contiguous list, bullets nested under each item → 1, 2 (was 1, 1).
    expect(markers(container)).toEqual(["1.", "2."]);
    expect(container.querySelectorAll("ol").length).toBe(1);
    // Sub-bullets attach as children of the numbered item.
    expect(container.querySelectorAll("ol > li ul li").length).toBe(3);
  });

  it("auto-increments the lazy all-\"1.\" convention", () => {
    const text = ["1. first", "- a", "1. second", "- b", "1. third"].join("\n");
    const { container } = render(<MarkdownLite text={text} />);
    expect(markers(container)).toEqual(["1.", "2.", "3."]);
  });

  it("respects a non-1 starting ordinal for a contiguous list", () => {
    const { container } = render(<MarkdownLite text={"3. c\n4. d\n5. e"} />);
    expect(markers(container)).toEqual(["3.", "4.", "5."]);
  });
});
