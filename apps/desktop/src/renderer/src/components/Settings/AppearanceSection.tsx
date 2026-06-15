import React from "react";
import { useTranslation } from "react-i18next";

import {
  BACKDROP_INTENSITY_MAX,
  BACKDROP_INTENSITY_MIN,
  BACKDROP_OPACITY_MAX,
  BACKDROP_OPACITY_MIN,
  BACKDROP_SPEED_MAX,
  BACKDROP_SPEED_MIN,
  BACKDROP_STYLES,
  type BackdropStyle,
  CARD_OPACITY_MAX,
  CARD_OPACITY_MIN,
  useAppearanceStore,
} from "@/stores/appearance";

// Label + description i18n keys per backdrop style (kept beside the store enum
// so adding a style is a one-line change here + the store).
const STYLE_KEYS = {
  aurora: { label: "appearance.styleAurora", desc: "appearance.styleAuroraDesc" },
  ascii: { label: "appearance.styleAscii", desc: "appearance.asciiRainDesc" },
  off: { label: "appearance.styleOff", desc: "appearance.styleOffDesc" },
} as const satisfies Record<BackdropStyle, { label: string; desc: string }>;

/**
 * Appearance settings — panel translucency + the ambient backdrop style
 * (aurora / ascii / off). Changes apply live (AppShell + the backdrop
 * components read the store) and persist across restarts.
 */
export function AppearanceSection(): React.JSX.Element {
  const { t } = useTranslation();
  const style = useAppearanceStore((s) => s.backdropStyle);
  const intensity = useAppearanceStore((s) => s.backdropIntensity);
  const speed = useAppearanceStore((s) => s.backdropSpeed);
  const opacity = useAppearanceStore((s) => s.backdropOpacity);
  const cardOpacity = useAppearanceStore((s) => s.cardOpacity);
  const setStyle = useAppearanceStore((s) => s.setBackdropStyle);
  const setIntensity = useAppearanceStore((s) => s.setBackdropIntensity);
  const setSpeed = useAppearanceStore((s) => s.setBackdropSpeed);
  const setOpacity = useAppearanceStore((s) => s.setBackdropOpacity);
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

      <label className="block text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-2">
        {t("appearance.backgroundStyle")}
      </label>
      <div
        role="radiogroup"
        aria-label={t("appearance.backgroundStyle")}
        className="grid grid-cols-3 gap-1 rounded-lg bg-bg-elevated p-1"
      >
        {BACKDROP_STYLES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={style === s}
            onClick={() => setStyle(s)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              style === s
                ? "bg-white/15 text-text-primary font-medium"
                : "text-text-secondary hover:bg-white/5"
            }`}
          >
            {t(STYLE_KEYS[s].label)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-text-tertiary">{t(STYLE_KEYS[style].desc)}</p>

      {/* Opacity fades the whole backdrop layer (aurora OR ascii) toward the dark
          base, so it's shown for any style except "off". */}
      <div className={style === "off" ? "hidden" : "mt-4"}>
        <label className="flex items-center justify-between text-xs uppercase tracking-wider font-semibold text-text-tertiary mb-2">
          <span>{t("appearance.opacity")}</span>
          <span className="font-mono normal-case tracking-normal text-text-secondary">
            {opacity}
          </span>
        </label>
        <input
          type="range"
          min={BACKDROP_OPACITY_MIN}
          max={BACKDROP_OPACITY_MAX}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="w-full accent-white"
          aria-label={t("appearance.backdropOpacity")}
        />
      </div>

      {/* Intensity/speed shape the ASCII rain only — the aurora draws its look
          from the bundled scene, so hide them for the other styles. */}
      <div className={style === "ascii" ? "" : "hidden"}>
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
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full accent-white"
            aria-label={t("appearance.backdropSpeed")}
          />
        </div>
      </div>
    </section>
  );
}
