import React from "react";
import { useTranslation } from "react-i18next";

import {
  BACKDROP_INTENSITY_MAX,
  BACKDROP_INTENSITY_MIN,
  BACKDROP_SPEED_MAX,
  BACKDROP_SPEED_MIN,
  CARD_OPACITY_MAX,
  CARD_OPACITY_MIN,
  useAppearanceStore,
} from "@/stores/appearance";

/**
 * Appearance settings — currently the ASCII glyph-rain backdrop. Changes apply
 * live (AsciiBackdrop reads the store) and persist across restarts.
 */
export function AppearanceSection(): React.JSX.Element {
  const { t } = useTranslation();
  const enabled = useAppearanceStore((s) => s.backdropEnabled);
  const intensity = useAppearanceStore((s) => s.backdropIntensity);
  const speed = useAppearanceStore((s) => s.backdropSpeed);
  const cardOpacity = useAppearanceStore((s) => s.cardOpacity);
  const setEnabled = useAppearanceStore((s) => s.setBackdropEnabled);
  const setIntensity = useAppearanceStore((s) => s.setBackdropIntensity);
  const setSpeed = useAppearanceStore((s) => s.setBackdropSpeed);
  const setCardOpacity = useAppearanceStore((s) => s.setCardOpacity);

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-3">{t("appearance.panels")}</h2>
      <div>
        <label className="flex items-center justify-between text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-2">
          <span>{t("appearance.panelOpacity")}</span>
          <span className="font-mono normal-case tracking-normal text-text-secondary">
            {cardOpacity}
          </span>
        </label>
        <input
          type="range"
          min={CARD_OPACITY_MIN}
          max={CARD_OPACITY_MAX}
          value={cardOpacity}
          onChange={(e) => setCardOpacity(Number(e.target.value))}
          className="w-full accent-white"
          aria-label={t("appearance.panelOpacity")}
        />
        <p className="mt-1 text-xs text-text-tertiary">{t("appearance.panelOpacityHint")}</p>
      </div>

      <h2 className="text-lg font-semibold mb-3 mt-8">{t("appearance.background")}</h2>

      <label className="flex items-center justify-between gap-4 py-2">
        <span className="text-sm">
          <span className="text-text-primary">{t("appearance.asciiRain")}</span>
          <span className="block text-xs text-text-tertiary mt-0.5">
            {t("appearance.asciiRainDesc")}
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-white"
          aria-label={t("appearance.enableBackdrop")}
        />
      </label>

      <div className={enabled ? "" : "opacity-40 pointer-events-none"}>
        <div className="mt-4">
          <label className="flex items-center justify-between text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-2">
            <span>{t("appearance.intensity")}</span>
            <span className="font-mono normal-case tracking-normal text-text-secondary">
              {intensity}
            </span>
          </label>
          <input
            type="range"
            min={BACKDROP_INTENSITY_MIN}
            max={BACKDROP_INTENSITY_MAX}
            value={intensity}
            disabled={!enabled}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="w-full accent-white"
            aria-label={t("appearance.backdropIntensity")}
          />
        </div>

        <div className="mt-4">
          <label className="flex items-center justify-between text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-2">
            <span>{t("appearance.speed")}</span>
            <span className="font-mono normal-case tracking-normal text-text-secondary">
              {speed}
            </span>
          </label>
          <input
            type="range"
            min={BACKDROP_SPEED_MIN}
            max={BACKDROP_SPEED_MAX}
            value={speed}
            disabled={!enabled}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full accent-white"
            aria-label={t("appearance.backdropSpeed")}
          />
        </div>
      </div>
    </section>
  );
}
