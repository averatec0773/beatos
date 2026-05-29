import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export interface LicenseTier {
  id: number;
  track_id: number;
  position: number;
  name: string;
  deliverables: string[];
  /** Map of currency code (uppercase) → price amount. Empty {} when the
   *  tier exists but has no price set yet. v0.0.27 replaces the old
   *  `price + currency` pair. */
  prices: Record<string, number>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicenseTierCreate {
  name?: string;
  deliverables?: string[];
  prices?: Record<string, number>;
  notes?: string | null;
}

export type LicenseTierUpdate = Partial<LicenseTierCreate>;

export const licenseTiers = {
  listForTrack: (trackId: number) => apiGet<LicenseTier[]>(`/api/tracks/${trackId}/license_tiers`),
  create: (trackId: number, payload: LicenseTierCreate) =>
    apiPost<LicenseTier>(`/api/tracks/${trackId}/license_tiers`, payload),
  update: (tierId: number, updates: LicenseTierUpdate) =>
    apiPut<LicenseTier>(`/api/license_tiers/${tierId}`, updates),
  remove: (tierId: number) => apiDelete(`/api/license_tiers/${tierId}`),
  reorder: async (trackId: number, ids: number[]): Promise<void> => {
    await apiPost(`/api/tracks/${trackId}/license_tiers/reorder`, { ids });
  },
};
