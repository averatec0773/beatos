import { appSettings } from "@/api/app-settings";
import { tracks } from "@/api/tracks";

/** App-setting key: whether newly-created tracks default to free. */
export const DEFAULT_IS_FREE_KEY = "default_is_free";

export async function loadDefaultIsFree(): Promise<boolean> {
  try {
    const r = await appSettings.get<boolean>(DEFAULT_IS_FREE_KEY);
    // Fresh install (null/unset) defaults to free; only an explicit `false` opts
    // out. Mirrors the shipped default-tiers preset.
    return r.value !== false;
  } catch (e) {
    console.warn("[default-free] load failed:", e);
    return false;
  }
}

export async function saveDefaultIsFree(value: boolean): Promise<void> {
  await appSettings.set(DEFAULT_IS_FREE_KEY, value);
}

/**
 * Best-effort: if the user's default is "free", mark the freshly-created track
 * free. Copy-once-then-independent (mirrors applyDefaultLicenseTiers). Never
 * throws — a failure must not break track creation.
 */
export async function applyDefaultIsFree(trackId: number): Promise<void> {
  try {
    if (await loadDefaultIsFree()) {
      await tracks.update(trackId, { is_free: true });
    }
  } catch (e) {
    console.warn("[default-free] apply failed:", e);
  }
}
