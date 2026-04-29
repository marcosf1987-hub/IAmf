import type { Response } from "express";
import { randomBytes } from "node:crypto";
import { jwtAccessTokenMaxAgeSeconds } from "./jwt-config";

export const ACCESS_COOKIE_NAME = "pp_access";
export const CSRF_COOKIE_NAME = "pp_csrf";

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

/** SameSite para sesión y CSRF: en prod por defecto `none` (SPA en otro host que el API); mismo sitio puede forzar `lax` con SESSION_COOKIE_SAMESITE=lax */
export function sessionCookieSameSite(): "lax" | "none" {
  const raw = process.env.SESSION_COOKIE_SAMESITE?.trim().toLowerCase();
  if (raw === "lax") return "lax";
  if (raw === "none") return "none";
  return process.env.NODE_ENV === "production" ? "none" : "lax";
}

function appendCookie(res: Response, parts: string[]): void {
  res.append("Set-Cookie", parts.join("; "));
}

/** CSRF double-submit: cookie legible por JS (no HttpOnly) + header X-CSRF-Token en mutaciones. */
export function setSessionCookies(res: Response, jwt: string): void {
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = jwtAccessTokenMaxAgeSeconds();
  const sameSite = sessionCookieSameSite();
  const csrf = randomBytes(32).toString("hex");

  const accessParts = [
    `${ACCESS_COOKIE_NAME}=${encodeURIComponent(jwt)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    `SameSite=${sameSite === "none" ? "None" : "Lax"}`,
  ];
  if (isProd || sameSite === "none") accessParts.push("Secure");

  const csrfParts = [
    `${CSRF_COOKIE_NAME}=${csrf}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    `SameSite=${sameSite === "none" ? "None" : "Lax"}`,
  ];
  if (isProd || sameSite === "none") csrfParts.push("Secure");

  appendCookie(res, accessParts);
  appendCookie(res, csrfParts);
}

export function clearSessionCookies(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = sessionCookieSameSite();
  const ss = sameSite === "none" ? "None" : "Lax";
  const accessParts = [`${ACCESS_COOKIE_NAME}=`, "Path=/", "Max-Age=0", "HttpOnly", `SameSite=${ss}`];
  const csrfParts = [`${CSRF_COOKIE_NAME}=`, "Path=/", "Max-Age=0", `SameSite=${ss}`];
  if (isProd || sameSite === "none") {
    accessParts.push("Secure");
    csrfParts.push("Secure");
  }
  appendCookie(res, accessParts);
  appendCookie(res, csrfParts);
}
