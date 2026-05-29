import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

vi.mock("@/api/distinct", () => ({
  distinct: { values: vi.fn().mockResolvedValue(["Trap Rap"]) },
}));

import { useVocabLocaleStore } from "@/stores/vocab-locale";
import { FilterFieldPopover } from "@/components/FilterFieldPopover";

describe("FilterFieldPopover genre labels", () => {
  beforeEach(() => {
    useVocabLocaleStore.setState({ locale: "both" });
  });

  it("renders genre value bilingually under 'both'", async () => {
    render(<FilterFieldPopover field="genre" onApply={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("陷阱说唱 (Trap Rap)")).toBeInTheDocument());
  });

  it("renders Chinese-only under 'zh'", async () => {
    act(() => useVocabLocaleStore.setState({ locale: "zh" }));
    render(<FilterFieldPopover field="genre" onApply={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("陷阱说唱")).toBeInTheDocument());
  });
});
