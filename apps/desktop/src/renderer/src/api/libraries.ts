import { apiGet, apiPost } from "./client";

export interface Library {
  id: number;
  name: string;
  root_path: string;
  created_at: string;
  is_active: boolean;
}

export const libraries = {
  init: (path: string) => apiPost<Library>("/api/libraries/init", { path }),
  active: () =>
    apiGet<Library>("/api/libraries/active").catch((e) => {
      if (String(e).includes("404")) return null;
      throw e;
    }),
  list: () => apiGet<Library[]>("/api/libraries"),
};
