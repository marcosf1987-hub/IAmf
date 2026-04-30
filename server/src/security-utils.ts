import type { Request, Response } from "express";
import { incrementSecurityMetric, readSecurityMetrics } from "./security-metrics";

export function securityError(res: Response, status: number, error: string): void {
  if (status === 401) incrementSecurityMetric("http_401");
  if (status === 403) incrementSecurityMetric("http_403");
  if (status === 429) incrementSecurityMetric("http_429");
  if (error === "csrf_invalid") incrementSecurityMetric("csrf_invalid");
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

export function readSecurityCounters(): Record<string, number> {
  return readSecurityMetrics();
}

