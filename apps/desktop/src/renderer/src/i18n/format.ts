import type { AppLanguage } from "./resources";

const INTL_LOCALE: Record<AppLanguage, string> = {
  en: "en-US",
  zh: "zh-CN",
};

export function formatDate(lang: AppLanguage, date: Date): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], { dateStyle: "medium" }).format(date);
}

export function formatNumber(lang: AppLanguage, n: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[lang]).format(n);
}

/**
 * Localized relative time. `fromMs` is the event time, `nowMs` the reference
 * "now" (injected so callers/tests stay deterministic). Uses numeric:"auto"
 * so en yields "yesterday"/"now" and zh yields "昨天"/"刚刚".
 */
export function formatRelativeTime(lang: AppLanguage, fromMs: number, nowMs: number): string {
  const diffSec = Math.round((fromMs - nowMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[lang], { numeric: "auto" });
  const abs = Math.abs(diffSec);
  // Bucket thresholds sit at the midpoint of the next unit so rounding never
  // overflows (e.g. 59m59s shows "1 hour ago", not "60 minutes ago"; 23h59m
  // shows "1 day ago"/"yesterday", not "24 hours ago").
  if (abs < 45) return rtf.format(diffSec, "second");
  if (abs < 2700) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 79_200) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86_400), "day");
}
