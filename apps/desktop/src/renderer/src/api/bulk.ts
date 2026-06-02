import { apiPost } from "./client";

export type ArraySpec = string[] | { add?: string[]; remove?: string[] };

export const bulk = {
  update(
    ids: number[],
    patch: Record<string, unknown>,
  ): Promise<{ updated_count: number; ids: number[] }> {
    return apiPost(`/api/tracks/bulk-update`, { ids, patch });
  },
  applyLicenseTemplate(ids: number[]): Promise<{ applied: number; ids: number[] }> {
    return apiPost(`/api/tracks/bulk-apply-license-template`, { ids });
  },
};
