import { apiGet, apiPost } from "./client";

export interface FacetValue {
  value: string;
  count: number;
}

export const facetsApi = {
  top: async (field: "producer" | "genre" | "mood" | "key", limit = 8): Promise<FacetValue[]> => {
    const res = await apiGet<{ items: FacetValue[] }>(
      `/api/tracks/facets?field=${field}&limit=${limit}`,
    );
    return res.items;
  },
  recent: async (): Promise<string[]> => {
    const res = await apiGet<{ items: string[] }>("/api/tracks/recent-searches");
    return res.items;
  },
  pushRecent: async (query: string): Promise<string[]> => {
    const res = await apiPost<{ items: string[] }>("/api/tracks/recent-searches", { query });
    return res.items;
  },
};
