import { appSettings } from "@/api/app-settings";
import { licenseTiers, type LicenseTierCreate } from "@/api/license-tiers";
import { useToastStore } from "@/stores/toast";

/**
 * App-setting key holding the array of tier templates copied onto every
 * newly-created track. Shape: `LicenseTierCreate[]` — exactly the same
 * payload the per-tier POST endpoint accepts.
 */
export const DEFAULT_LICENSE_TIERS_KEY = "default_license_tiers";

export type DefaultLicenseTierTemplate = LicenseTierCreate;

export async function loadDefaultLicenseTiers(): Promise<DefaultLicenseTierTemplate[]> {
  try {
    const r = await appSettings.get<DefaultLicenseTierTemplate[]>(DEFAULT_LICENSE_TIERS_KEY);
    return Array.isArray(r.value) ? r.value : [];
  } catch (e) {
    console.warn("[default-license-tiers] load failed:", e);
    return [];
  }
}

export async function saveDefaultLicenseTiers(
  templates: DefaultLicenseTierTemplate[],
): Promise<void> {
  await appSettings.set(DEFAULT_LICENSE_TIERS_KEY, templates);
}

/**
 * Best-effort apply: POSTs each template tier to the given track. Errors
 * are logged but never raised — a default template that conflicts with the
 * track's pre-existing tiers (or any other transient failure) should not
 * fail the track-creation flow that called us.
 */
export async function applyDefaultLicenseTiers(trackId: number): Promise<void> {
  const templates = await loadDefaultLicenseTiers();
  if (templates.length === 0) return;
  for (const tpl of templates) {
    try {
      await licenseTiers.create(trackId, tpl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("same deliverables already exists")) {
        console.warn("[default-license-tiers] skip duplicate tier:", tpl.deliverables);
        continue;
      }
      console.warn("[default-license-tiers] apply tier failed:", tpl, msg);
      useToastStore
        .getState()
        .show("error", `默认价格档复制失败 (${tpl.name ?? tpl.deliverables?.join("+")}): ${msg}`);
    }
  }
}
