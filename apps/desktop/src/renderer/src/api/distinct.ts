import { apiGet } from "./client";

export const distinct = {
  values(field: "producer" | "genre" | "mood" | "key_signature"): Promise<string[]> {
    return apiGet<string[]>(`/api/tracks/distinct/${field}`);
  },
};
