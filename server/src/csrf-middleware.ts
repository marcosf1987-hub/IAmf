import type { NextFunction, Request, Response } from "express";
import {
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  parseCookieHeader,
} from "./session-cookie";

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
  if (!hasSessionCookie) {
    next();
    return;
  }

  const csrfCookie = cookies[CSRF_COOKIE_NAME]?.trim();
  const rawHeader = req.headers[CSRF_HEADER];
  const csrfHeader = typeof rawHeader === "string" ? rawHeader.trim() : undefined;

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    res.status(403).json({ error: "csrf_invalid" });
    return;
  }

  next();
}
