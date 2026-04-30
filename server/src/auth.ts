import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { jwtAccessTokenMaxAgeSeconds } from "./jwt-config";
import { ACCESS_COOKIE_NAME, parseCookieHeader } from "./session-cookie";
import { logSecurityEvent, securityError } from "./security-utils";

/** Roles en JWT (alineados con Prisma `UserRole`). */
export type AppRole = "super_admin" | "org_admin" | "member";

export type AuthTokenPayload = {
  userId: string;
  role: AppRole;
  companyId: string;
  tokenVersion: number;
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
const authPrisma = new PrismaClient();

export function isAuthTokenStale(
  payload: AuthTokenPayload,
  user: { role: AppRole; companyId: string; tokenVersion: number }
): boolean {
  return (
    user.role !== payload.role ||
    user.companyId !== payload.companyId ||
    user.tokenVersion !== payload.tokenVersion
  );
}

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
  void (async () => {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    securityError(res, 401, "missing_token");
    return;
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
    const user = await authPrisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, companyId: true, status: true, tokenVersion: true },
    });
    if (!user || user.status !== "active") {
      logSecurityEvent(req, "auth_rejected", { reason: "user_inactive_or_missing" });
      securityError(res, 401, "invalid_token");
      return;
    }
    if (isAuthTokenStale(decoded, user)) {
      logSecurityEvent(req, "auth_rejected", { reason: "token_revoked_or_stale" });
      securityError(res, 401, "invalid_token");
      return;
    }
    (req as AuthedRequest).auth = decoded;
    next();
  } catch (_err) {
    securityError(res, 401, "invalid_token");
  }
  })();
}
