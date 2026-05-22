import { resolveUserErrorMessage } from "../i18n/translate-api-error";

/**
 * Convierte errores técnicos (red, Prisma, fetch, códigos API) en mensajes entendibles.
 * En desarrollo se conserva el mensaje original si no hay traducción conocida.
 */
export function formatApiError(err: unknown): string {
  const dev = import.meta.env.DEV;
  const raw = err instanceof Error ? err.message : String(err);
  const resolved = resolveUserErrorMessage(raw);
  if (dev && resolved === raw.trim()) return raw;
  return resolved;
}
