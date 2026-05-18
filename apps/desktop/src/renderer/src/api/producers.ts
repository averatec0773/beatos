import { apiPost } from "./client";

export const producers = {
  preview(values: string[]): Promise<{ affected: number }> {
    return apiPost("/api/producers/preview", { values });
  },
  rewrite(from: string[], to: string | null): Promise<{ affected: number }> {
    return apiPost("/api/producers/rewrite", { from, to });
  },
};
