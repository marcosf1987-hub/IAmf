/**
 * Puntos F1: 10 acierto P1, 5 P2 y P3, 1 por cada acierto P4–P10 (sin puntos fuera del top 10).
 */
export function normalizePlacements(raw: unknown): (number | null)[] {
  if (!Array.isArray(raw)) return Array(10).fill(null);
  const out: (number | null)[] = [];
  for (let i = 0; i < 10; i++) {
    const v = raw[i];
    if (v === null || v === undefined) {
      out.push(null);
      continue;
    }
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    out.push(Number.isFinite(n) && n > 0 ? n : null);
  }
  return out;
}

/** `resultTop10` guardado en F1Race: [{ position, driverNumber }, ...] */
export function officialTop10DriverNumbers(resultTop10: unknown): number[] {
  if (!Array.isArray(resultTop10)) return [];
  const byPos = new Map<number, number>();
  for (const row of resultTop10) {
    if (!row || typeof row !== "object") continue;
    const o = row as { position?: unknown; driverNumber?: unknown };
    const pos = typeof o.position === "number" ? o.position : parseInt(String(o.position), 10);
    const dn = typeof o.driverNumber === "number" ? o.driverNumber : parseInt(String(o.driverNumber), 10);
    if (!Number.isFinite(pos) || pos < 1 || pos > 10) continue;
    if (!Number.isFinite(dn)) continue;
    byPos.set(pos, dn);
  }
  const arr: number[] = [];
  for (let p = 1; p <= 10; p++) arr.push(byPos.get(p) ?? 0);
  return arr;
}

export function scoreF1Placements(predicted: (number | null)[], officialTop10: number[]): number {
  const p = normalizePlacements(predicted);
  const o = officialTop10;
  if (o.length < 10) return 0;
  let pts = 0;
  for (let i = 0; i < 10; i++) {
    const pi = p[i];
    const oi = o[i];
    if (pi == null || oi === 0) continue;
    if (pi !== oi) continue;
    if (i === 0) pts += 10;
    else if (i === 1 || i === 2) pts += 5;
    else pts += 1;
  }
  return pts;
}

export type F1UserPointsRow = { userId: string; points: number };

/** Suma puntos F1 por usuario para carreras con resultado oficial. */
export function aggregateF1PointsByUser(
  races: { id: string; resultTop10: unknown }[],
  predictions: { userId: string; raceId: string; placements: unknown }[]
): Map<string, number> {
  const totals = new Map<string, number>();
  const raceOfficial = new Map<string, number[]>();
  for (const r of races) {
    const top = officialTop10DriverNumbers(r.resultTop10);
    if (top.length === 10 && top.every((n) => n > 0)) raceOfficial.set(r.id, top);
  }
  for (const pr of predictions) {
    const official = raceOfficial.get(pr.raceId);
    if (!official) continue;
    const pts = scoreF1Placements(normalizePlacements(pr.placements), official);
    if (pts <= 0) continue;
    totals.set(pr.userId, (totals.get(pr.userId) ?? 0) + pts);
  }
  return totals;
}
