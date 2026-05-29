import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { AnalysisProgressBar } from "@/components/AnalysisProgressBar";
import { useAnalysisJobStore } from "@/stores/analysis-job";
import { analysis } from "@/api/analysis";

describe("AnalysisProgressBar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useAnalysisJobStore.setState({ jobId: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls and shows progress, then clears on done", async () => {
    const statuses = [
      { job_id: "j1", total: 2, done: 1, current_title: "A", filled_bpm: 1, filled_key: 0, errors: 0, status: "running" as const },
      { job_id: "j1", total: 2, done: 2, current_title: null, filled_bpm: 2, filled_key: 1, errors: 0, status: "done" as const },
    ];
    vi.spyOn(analysis, "batchStatus").mockImplementation(async () => statuses.shift()!);

    render(<AnalysisProgressBar />);
    act(() => useAnalysisJobStore.getState().start("j1", 2));

    await waitFor(() => screen.getByText(/1\s*\/\s*2/));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    await waitFor(() => expect(useAnalysisJobStore.getState().jobId).toBeNull());
  });
});
