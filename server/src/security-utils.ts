import type { Request, Response } from "express";

export function securityError(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

export function logSecurityEvent(req: Request, event: string, details?: Record<string, string | number | boolean>): void {
  const base = {
    event,
    method: req.method,
    path: req.path,
  };
  const payload = details ? { ...base, ...details } : base;
  // eslint-disable-next-line no-console
  console.warn("[security]", JSON.stringify(payload));
}

