import i18n from "../i18n";

const CODE_RE = /^[a-z][a-z0-9_]*$/;

/** Traduce un código `error` del API; si no existe clave, devuelve fallback. */
export function translateApiErrorCode(code: string, fallback?: string): string {
  const normalized = code.trim();
  if (!normalized) {
    return fallback ?? i18n.t("errors:codes.unknown");
  }
  const key = `errors:codes.${normalized}`;
  if (i18n.exists(key)) {
    return i18n.t(key);
  }
  return fallback ?? i18n.t("errors:codes.unknown");
}

/** Extrae código estable desde mensaje de Error (suele ser `error` del JSON). */
export function apiErrorCodeFromMessage(raw: string): string | null {
  const t = raw.trim();
  if (CODE_RE.test(t)) return t;
  return null;
}
