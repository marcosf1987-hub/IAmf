import type { NextFunction, Request, Response } from "express";
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  parseCookieHeader,
} from "./session-cookie";
import { logSecurityEvent, securityError } from "./security-utils";

const CSRF_HEADER = "x-csrf-token";

/** Rutas POST sin sesión previa o flujos públicos que no deben exigir CSRF. */
const CSRF_EXEMPT_PATHS = new Set([
  "/auth/login",
  "/auth/signup",
  "/auth/invite/accept",
  "/auth/competition-invite/accept",
]);

function safePath(req: Request): string {
  try {
    const u = new URL(req.originalUrl || req.url, "http://localhost");
    return u.pathname || "";
  } catch {
    return req.path || "";
  }
}

/**
 * Si hay cookie de sesión HttpOnly, las mutaciones deben enviar el mismo valor que `pp_csrf` en header.
 * Solo Bearer (sin cookie de sesión): compatibilidad temporal TODO(PR3): retirar.
 */
function hasBearerAuthHeader(req: Request): boolean {
  const auth = req.header("authorization");
  if (!auth) return false;
  const [scheme, token] = auth.split(" ");
  return scheme?.toLowerCase() === "bearer" && Boolean(token?.trim());
}

export function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }

  const path = safePath(req);
  if (CSRF_EXEMPT_PATHS.has(path)) {
    next();
    return;
  }

  const cookies = parseCookieHeader(req.headers.cookie);
  const hasSessionCookie = Boolean(cookies[ACCESS_COOKIE_NAME]?.trim());
  const hasBearer = hasBearerAuthHeader(req);
  const needsCsrf = hasSessionCookie || hasBearer;
  if (!needsCsrf) {
    next();
    return;
  }

  const csrfCookie = cookies[CSRF_COOKIE_NAME]?.trim();
  const rawHeader = req.headers[CSRF_HEADER];
  const csrfHeader = typeof rawHeader === "string" ? rawHeader.trim() : undefined;

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    logSecurityEvent(req, "csrf_rejected", {
      hasSessionCookie,
      hasBearer,
      hasCsrfCookie: Boolean(csrfCookie),
      hasCsrfHeader: Boolean(csrfHeader),
    });
    securityError(res, 403, "csrf_invalid");
    return;
  }

  next();
}
