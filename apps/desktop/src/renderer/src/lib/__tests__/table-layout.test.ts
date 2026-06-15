import { describe, it, expect } from "vitest";

import { getGridTemplateColumns } from "@/lib/table-layout";
import { MIN_WIDTH, type ColumnKey } from "@/stores/column-widths";

const base: Record<ColumnKey, number> = {
  title: 0,
  bpm: 80,
  key: 96,
  genre: 144,
  updated: 96,
};

describe("getGridTemplateColumns", () => {
  it("floors the unfrozen (title === 0) title track so it can't collapse to 0", () => {
    // Regression: a bare `1fr` title track has a 0 auto-minimum (the cell is
    // min-w-0 + truncate), so shrinking the table container (growing the
    // preview panel) collapsed the title to invisible until a column-resizer
    // click happened to freeze it. The unfrozen track must carry the title's
    // MIN_WIDTH floor up front.
    const cols = getGridTemplateColumns(base);
    expect(cols).toContain(`minmax(${MIN_WIDTH.title}px, 1fr)`);
    // The exact track string, in order: cover · title · bpm · key · genre · updated.
    expect(cols).toBe(`52px minmax(${MIN_WIDTH.title}px, 1fr) 80px 96px 144px minmax(96px, 1fr)`);
  });

  it("renders a frozen title as a fixed px track (freeze path unchanged)", () => {
    const cols = getGridTemplateColumns({ ...base, title: 160 });
    expect(cols).toBe("52px 160px 80px 96px 144px minmax(96px, 1fr)");
  });
});
