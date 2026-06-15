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

/**
 * Fresh-install default tier template (MP3 / WAV / STEMS with CNY prices +
 * revenue share). Used only when the user has never configured their own —
 * once they save (even an empty set) that explicit value wins.
 */
export const DEFAULT_LICENSE_TIERS: DefaultLicenseTierTemplate[] = [
  { name: "MP3", deliverables: ["mp3"], prices: { CNY: 128 }, share: 25 },
  { name: "WAV", deliverables: ["wav"], prices: { CNY: 188 }, share: 20 },
  { name: "STEMS", deliverables: ["stem"], prices: { CNY: 288 }, share: 15 },
];

export async function loadDefaultLicenseTiers(): Promise<DefaultLicenseTierTemplate[]> {
  try {
    const r = await appSettings.get<DefaultLicenseTierTemplate[]>(DEFAULT_LICENSE_TIERS_KEY);
    // Null = never configured → fall back to the shipped default. An explicit
    // (even empty) saved array is the user's choice and wins.
    return Array.isArray(r.value) ? r.value : DEFAULT_LICENSE_TIERS.map((t) => ({ ...t }));
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
