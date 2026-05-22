import { useTranslation } from "react-i18next";
import { LOCALE_STORAGE_KEY, isAppLocale, type AppLocale } from "../i18n";

type Props = {
  className?: string;
  /** Variante compacta para header de marketing */
  compact?: boolean;
};

export default function LanguageSwitcher({ className = "", compact = false }: Props) {
  const { i18n, t } = useTranslation("common");
  const current = isAppLocale(i18n.language) ? i18n.language : "es";

  function setLocale(locale: AppLocale) {
    void i18n.changeLanguage(locale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`lang-switcher ${compact ? "lang-switcher--compact" : ""} ${className}`.trim()}
      role="group"
      aria-label={t("language.label")}
    >
      <button
        type="button"
        className={`lang-switcher-btn ${current === "es" ? "lang-switcher-btn--active" : ""}`}
        onClick={() => setLocale("es")}
        aria-pressed={current === "es"}
      >
        {compact ? "ES" : t("language.es")}
      </button>
      <button
        type="button"
        className={`lang-switcher-btn ${current === "en" ? "lang-switcher-btn--active" : ""}`}
        onClick={() => setLocale("en")}
        aria-pressed={current === "en"}
      >
        {compact ? "EN" : t("language.en")}
      </button>
    </div>
  );
}
