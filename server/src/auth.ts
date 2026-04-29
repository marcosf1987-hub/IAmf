import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { jwtAccessTokenMaxAgeSeconds } from "./jwt-config";
import { ACCESS_COOKIE_NAME, parseCookieHeader } from "./session-cookie";

/** Roles en JWT (alineados con Prisma `UserRole`). */
export type AppRole = "super_admin" | "org_admin" | "member";

export type AuthTokenPayload = {
  userId: string;
  role: AppRole;
  companyId: string;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: jwtAccessTokenMaxAgeSeconds(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

export type AuthedRequest = Request & { auth: AuthTokenPayload };

/** Verifica el JWT sin middleware (p. ej. requireAdmin con rol desde BD). */
export function verifyAccessToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Obtiene el JWT: si llegan cookie HttpOnly y Bearer, se prioriza la cookie
 * (menos riesgo de fuga por logs/extensiones que reenvían Authorization).
 */
export function getAccessTokenFromRequest(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const fromCookie = cookies[ACCESS_COOKIE_NAME]?.trim();
  const header = req.header("authorization") ?? "";
  const [scheme, bearerRaw] = header.split(" ");
  const fromBearer =
    scheme?.toLowerCase() === "bearer" && bearerRaw?.trim() ? bearerRaw.trim() : null;

  if (fromCookie && fromBearer) return fromCookie;
  if (fromCookie) return fromCookie;
  if (fromBearer) return fromBearer;
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
    (req as AuthedRequest).auth = decoded;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}
