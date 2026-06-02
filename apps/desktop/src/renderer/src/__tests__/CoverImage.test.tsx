import { render, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { CoverImage } from "@/components/CoverImage";

function img(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector("img");
}
function placeholder(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[aria-label="No cover"]');
}
async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("CoverImage resilience", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a transient load error instead of sticking on the placeholder", async () => {
    const { container } = render(<CoverImage assetId={1} size={48} />);
    expect(img(container)).not.toBeNull();

    // First two failures schedule a retry — still an <img>, no placeholder.
    fireEvent.error(img(container)!);
    expect(placeholder(container)).toBeNull();
    await tick(300);
    expect(img(container)).not.toBeNull();

    fireEvent.error(img(container)!);
    await tick(300);
    expect(placeholder(container)).toBeNull();

    // Third failure exhausts retries → placeholder.
    fireEvent.error(img(container)!);
    expect(placeholder(container)).not.toBeNull();
  });

  it("resets the error state when assetId changes", async () => {
    const { container, rerender } = render(<CoverImage assetId={1} size={48} />);
    fireEvent.error(img(container)!);
    await tick(300);
    fireEvent.error(img(container)!);
    await tick(300);
    fireEvent.error(img(container)!);
    expect(placeholder(container)).not.toBeNull();

    // A new cover must re-attempt, not inherit the stuck error.
    rerender(<CoverImage assetId={2} size={48} />);
    expect(placeholder(container)).toBeNull();
    expect(img(container)).not.toBeNull();
  });
});
