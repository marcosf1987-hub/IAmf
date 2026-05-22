import i18n from "../i18n";
import { intlLocale, isAppLocale, type AppLocale } from "../i18n/constants";

export function currentIntlLocale(): string {
  const lng = i18n.language;
  const locale: AppLocale = isAppLocale(lng) ? lng : "es";
  return intlLocale(locale);
}

export function formatDateTime(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(currentIntlLocale(), options).format(d);
}
