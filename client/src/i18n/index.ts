import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import esAuth from "./locales/es/auth.json";
import esCarousel from "./locales/es/carousel.json";
import esCommon from "./locales/es/common.json";
import esErrors from "./locales/es/errors.json";
import esHome from "./locales/es/home.json";

import enAuth from "./locales/en/auth.json";
import enCarousel from "./locales/en/carousel.json";
import enCommon from "./locales/en/common.json";
import enErrors from "./locales/en/errors.json";
import enHome from "./locales/en/home.json";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from "./constants";

export { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES, intlLocale, isAppLocale, resolveLocaleFromBrowserTag } from "./constants";
export type { AppLocale } from "./constants";

function syncDocumentLanguage(lng: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lng.startsWith("en") ? "en" : "es";
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: {
        common: esCommon,
        auth: esAuth,
        home: esHome,
        errors: esErrors,
        carousel: esCarousel,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        home: enHome,
        errors: enErrors,
        carousel: enCarousel,
      },
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: ["es", "en"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    ns: ["common", "auth", "home", "errors", "carousel"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lang",
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
      convertDetectedLanguage: (lng: string) => {
        const base = lng.split("-")[0]?.toLowerCase() ?? lng;
        if (base === "en") return "en";
        if (base === "es") return "es";
        return "es";
      },
    },
  });

i18n.on("languageChanged", syncDocumentLanguage);
syncDocumentLanguage(i18n.language);

export default i18n;
