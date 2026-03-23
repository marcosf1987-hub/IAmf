import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type AuthTokenPayload = {
  userId: string;
  role: "employee" | "admin";
  companyId: string;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

/** Segundos hasta expiración (solo número → compatible con todos los @types/jsonwebtoken). */
function jwtExpiresInSeconds(): number {
  const raw = process.env.JWT_EXPIRES_IN?.trim();
  if (!raw) return 7 * 24 * 60 * 60;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const days = /^(\d+)d$/i.exec(raw);
  if (days) return parseInt(days[1], 10) * 24 * 60 * 60;
  return 7 * 24 * 60 * 60;
}

export function signAccessToken(payload: AuthTokenPayload): string {
  // Cast explícito: distintas versiones de @types/jsonwebtoken tipan distinto `expiresIn`.
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: jwtExpiresInSeconds(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

export type AuthedRequest = Request & { auth: AuthTokenPayload };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
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

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    const authed = req as AuthedRequest;
    if (authed.auth.role !== "admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  });
}

