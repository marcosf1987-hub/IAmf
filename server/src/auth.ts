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

export function signAccessToken(payload: AuthTokenPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
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

