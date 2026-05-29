import { create } from "zustand";

interface State {
  jobId: string | null;
  total: number;
  start(jobId: string, total: number): void;
  clear(): void;
}

export const useAnalysisJobStore = create<State>((set) => ({
  jobId: null,
  total: 0,
  start: (jobId, total) => set({ jobId, total }),
  clear: () => set({ jobId: null, total: 0 }),
}));
