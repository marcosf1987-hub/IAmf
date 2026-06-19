import type { Request } from "express";

const ADMIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type AdminDateRange = { from: Date; to: Date };

export type AdminDateRangeResult =
  | { ok: true; range?: AdminDateRange }
  | { ok: false; message: string };

/** Query `from` y `to` en YYYY-MM-DD (día UTC). Sin parámetros = todo el período. */
export function parseAdminDateRangeQuery(req: Request): AdminDateRangeResult {
  const fromRaw = typeof req.query.from === "string" ? req.query.from.trim() : "";
  const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";
  if (!fromRaw && !toRaw) return { ok: true };
  if (!fromRaw || !toRaw) {
    return { ok: false, message: "Indicá fecha desde y hasta, o ninguna para todo el período." };
  }
  if (!ADMIN_DATE_RE.test(fromRaw) || !ADMIN_DATE_RE.test(toRaw)) {
    return { ok: false, message: "Las fechas deben tener formato YYYY-MM-DD." };
  }
  const from = new Date(`${fromRaw}T00:00:00.000Z`);
  const to = new Date(`${toRaw}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, message: "Fecha inválida." };
  }
  if (from > to) {
    return { ok: false, message: "La fecha desde no puede ser posterior a la fecha hasta." };
  }
  return { ok: true, range: { from, to } };
}

export function adminDateRangeQueryStrings(range?: AdminDateRange): { from?: string; to?: string } {
  if (!range) return {};
  return {
    from: range.from.toISOString().slice(0, 10),
    to: range.to.toISOString().slice(0, 10),
  };
}
