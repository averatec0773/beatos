import { apiDelete, apiGet, apiPut } from "./client";

/**
 * Catalog-level key/value JSON store. Schema is owned by the caller — this
 * layer just round-trips JSON. v0.0.27 first consumer: default license tier
 * templates (`default_license_tiers`).
 */
export interface AppSettingResponse<T> {
  key: string;
  value: T | null;
}

export const appSettings = {
  get: <T>(key: string) => apiGet<AppSettingResponse<T>>(`/api/app_settings/${key}`),
  set: <T>(key: string, value: T) =>
    apiPut<AppSettingResponse<T>>(`/api/app_settings/${key}`, { value }),
  remove: (key: string) => apiDelete(`/api/app_settings/${key}`),
};
