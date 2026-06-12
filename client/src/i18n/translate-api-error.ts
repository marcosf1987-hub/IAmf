import i18n from "./index";

const API_CODE_RE = /^[a-z][a-z0-9_]*$/;

/** Traduce un código estable del API (`error` en JSON). */
export function translateApiErrorCode(code: string): string | null {
  const key = `errors:api.${code}`;
  if (!i18n.exists(key)) return null;
  return i18n.t(key);
}

/** ¿El mensaje parece un código de API y no texto libre? */
export function looksLikeApiErrorCode(raw: string): boolean {
  return API_CODE_RE.test(raw.trim());
}

/**
 * Resuelve mensaje para mostrar al usuario: código API, patrones de red, o texto legacy.
 */
export function resolveUserErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return i18n.t("errors:generic.unknown");

  if (looksLikeApiErrorCode(trimmed)) {
    const translated = translateApiErrorCode(trimmed);
    if (translated) return translated;
  }

  if (/P1001|Can't reach database|ECONNREFUSED|ETIMEDOUT|network|Failed to fetch/i.test(trimmed)) {
    return i18n.t("errors:generic.network");
  }
  if (/HTML en lugar de JSON|devolvió HTML|returned HTML|localhost:4000/i.test(trimmed)) {
    return i18n.t("errors:generic.invalidApiResponse");
  }
  if (trimmed === "Request failed") {
    return i18n.t("errors:generic.requestFailed");
  }
  if (trimmed === "Unauthorized" || trimmed === "Unauthorized.") {
    return i18n.t("errors:generic.unauthorized");
  }
  if (/JWT_SECRET|DATABASE_URL|prisma|migrate deploy|db seed|Railway|redeploy|postgresql|FOOTBALL_DATA|BREVO|SMTP_|VITE_API_URL|platform-internal|PredictionHistory/i.test(trimmed)) {
    return i18n.t("errors:generic.serverMisconfigured");
  }

  // Mensajes legacy en español del API (hasta migrar todo a códigos)
  const legacy: Record<string, string> = {
    "No hay una liga con ese código.": "code_not_found",
    "Para salir vos usá «Abandonar liga».": "use_leave",
    "La ventana de predicción ya cerró (1 h antes de la carrera).": "race_locked",
    "Ya existe una cuenta con este email.": "email_in_use",
    "No hay cupos disponibles.": "insufficient_seats",
    "La empresa alcanzó el máximo de competencias permitido.": "competition_limit",
    "Tenés que iniciar sesión con el mismo email al que se envió la invitación.": "email_mismatch",
    "Existe una cuenta con ese email pero está deshabilitada.": "user_disabled",
  };
  const code = legacy[trimmed];
  if (code) {
    const t = translateApiErrorCode(code);
    if (t) return t;
  }

  return trimmed;
}
