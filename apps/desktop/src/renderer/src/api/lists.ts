import { apiDelete, apiGet, apiPost, apiPut } from "./client";

export type ListKind = "system" | "user" | "beattape";

export interface List {
  id: number;
  name: string;
  kind: ListKind;
  position: number;
  created_at: string;
}

export const lists = {
  all: () => apiGet<List[]>("/api/lists"),
  create: (name: string, kind: ListKind = "user") =>
    apiPost<List>("/api/lists", { name, kind }),
  rename: (id: number, name: string) => apiPut<List>(`/api/lists/${id}`, { name }),
  remove: (id: number) => apiDelete(`/api/lists/${id}`),
  addTrack: (listId: number, trackId: number) =>
    apiPost<void>(`/api/lists/${listId}/tracks`, { track_id: trackId }),
  removeTrack: (listId: number, trackId: number) =>
    apiDelete(`/api/lists/${listId}/tracks/${trackId}`),
};
