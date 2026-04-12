/**
 * Convierte errores técnicos (red, Prisma, fetch) en mensajes entendibles en producción.
 * En desarrollo se conserva el mensaje original para depurar.
 */
export function formatApiError(err: unknown): string {
  const dev = import.meta.env.DEV;
  const raw = err instanceof Error ? err.message : String(err);

  if (dev) return raw;

  if (/P1001|Can't reach database|ECONNREFUSED|ETIMEDOUT|network|Failed to fetch/i.test(raw)) {
    return "No pudimos conectar con el servidor. Revisá tu conexión o intentá más tarde.";
  }
  if (/HTML en lugar de JSON|devolvió HTML|localhost:4000/i.test(raw)) {
    return "El servicio no respondió como esperábamos. Si usás la app publicada, comprobá que esté bien configurada.";
  }
  if (raw === "Request failed") {
    return "La solicitud no pudo completarse. Probá de nuevo.";
  }
  if (raw === "Unauthorized") {
    return "Tu sesión expiró o no tenés permiso. Iniciá sesión de nuevo.";
  }
  if (/JWT_SECRET/i.test(raw)) {
    return "Falta configuración en el servidor. Contactá al administrador.";
  }

  return raw;
}
