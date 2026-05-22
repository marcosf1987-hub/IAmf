import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import esApp from "./locales/es/app.json";
import esAuth from "./locales/es/auth.json";
import esCarousel from "./locales/es/carousel.json";
import esCommon from "./locales/es/common.json";
import esErrors from "./locales/es/errors.json";
import esF1 from "./locales/es/f1.json";
import esHome from "./locales/es/home.json";
import esIa from "./locales/es/ia.json";
import esLigas from "./locales/es/ligas.json";
import esProde from "./locales/es/prode.json";
import esProfile from "./locales/es/profile.json";
import esResultados from "./locales/es/resultados.json";

import enApp from "./locales/en/app.json";
import enAuth from "./locales/en/auth.json";
import enCarousel from "./locales/en/carousel.json";
import enCommon from "./locales/en/common.json";
import enErrors from "./locales/en/errors.json";
import enF1 from "./locales/en/f1.json";
import enHome from "./locales/en/home.json";
import enIa from "./locales/en/ia.json";
import enLigas from "./locales/en/ligas.json";
import enProde from "./locales/en/prode.json";
import enProfile from "./locales/en/profile.json";
import enResultados from "./locales/en/resultados.json";
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
        app: esApp,
        prode: esProde,
        f1: esF1,
        profile: esProfile,
        ligas: esLigas,
        ia: esIa,
        resultados: esResultados,
      },
      en: {
        common: enCommon,
        auth: enAuth,
        home: enHome,
        errors: enErrors,
        carousel: enCarousel,
        app: enApp,
        prode: enProde,
        f1: enF1,
        profile: enProfile,
        ligas: enLigas,
        ia: enIa,
        resultados: enResultados,
      },
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: ["es", "en"],
    nonExplicitSupportedLngs: true,
    load: "languageOnly",
    ns: ["common", "auth", "home", "errors", "carousel", "app", "prode", "f1", "profile", "ligas", "ia", "resultados"],
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
