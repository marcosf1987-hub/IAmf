import i18n from "../i18n/index";
import { looksLikeApiErrorCode, resolveUserErrorMessage } from "../i18n/translate-api-error";

const TECHNICAL_RE =
  /prisma|migrate|migration|postgresql|postgres|DATABASE_URL|JWT_SECRET|Railway|redeploy|db seed|npx prisma|FOOTBALL_DATA|BREVO|SMTP_|VITE_API_URL|platform-internal|PredictionHistory|OAUTH_|tabla\s+`?/i;

/** ¿Parece texto operativo / interno y no apto para usuario final? */
export function looksTechnicalErrorMessage(raw: string): boolean {
  return TECHNICAL_RE.test(raw);
}

/**
 * Convierte errores técnicos (red, Prisma, fetch, códigos API) en mensajes entendibles.
 * En producción nunca devuelve detalle operativo sin traducir.
 */
export function formatApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.trim();
  if (!trimmed) return i18n.t("errors:generic.unknown");

  const resolved = resolveUserErrorMessage(raw);

  if (import.meta.env.PROD) {
    if (looksTechnicalErrorMessage(trimmed) || looksTechnicalErrorMessage(resolved)) {
      return i18n.t("errors:generic.unknown");
    }
    if (resolved === trimmed && looksLikeApiErrorCode(trimmed)) {
      return i18n.t("errors:generic.unknown");
    }
    return resolved;
  }

  if (resolved === trimmed && looksTechnicalErrorMessage(trimmed)) {
    return i18n.t("errors:generic.unknown");
  }
  if (resolved === trimmed) return raw;
  return resolved;
}

const FALLBACK_I18N: Record<string, string> = {
  joinLeagueFailed: "errors:client.joinLeagueFailed",
  inviteAcceptFailed: "errors:client.inviteAcceptFailed",
  signup_failed: "errors:api.signup_failed",
  invalid_invite: "errors:api.invalid_invite",
  unauthorized: "errors:generic.unauthorized",
  "Request failed": "errors:generic.requestFailed",
};

/** Prioriza código estable del API; nunca expone message técnico si hay código. */
export function apiErrorFromBody(
  body: { error?: string; message?: string },
  fallback = "Request failed"
): string {
  const code = body.error?.trim();
  if (code) return formatApiError(new Error(code));
  const msg = body.message?.trim();
  if (msg) return formatApiError(new Error(msg));
  const i18nKey = FALLBACK_I18N[fallback];
  if (i18nKey && i18n.exists(i18nKey)) return i18n.t(i18nKey);
  return formatApiError(new Error(fallback));
}
