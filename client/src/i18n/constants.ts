/** Idiomas soportados (BCP 47). */
export const SUPPORTED_LOCALES = ["es", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "es";
export const LOCALE_STORAGE_KEY = "pp_locale";

/** Locale para `Intl` (fechas/números). */
export function intlLocale(locale: AppLocale): string {
  return locale === "en" ? "en-US" : "es-AR";
}

/** Normaliza tags del navegador (`en-US`, `es-AR`) al locale de la app. */
export function resolveLocaleFromBrowserTag(tag: string): AppLocale | null {
  const base = tag.trim().toLowerCase().split("-")[0];
  if (base === "en") return "en";
  if (base === "es") return "es";
  return null;
}

export function isAppLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
