import type { PrismaClient } from "@prisma/client";

const OPENF1 = "https://api.openf1.org/v1";

type OpenF1Session = {
  session_key: number;
  session_type: string;
  session_name: string;
  date_start: string;
  meeting_key: number;
  circuit_short_name?: string;
  country_name?: string;
  year: number;
  is_cancelled?: boolean;
};

type OpenF1ResultRow = {
  position: number;
  driver_number: number;
};

type OpenF1Driver = {
  driver_number?: number;
  full_name?: string;
  name_acronym?: string;
  broadcast_name?: string;
};

export type OpenF1DriverEntry = { driverNumber: number; label: string };

function driverNumberFromOpenF1Row(d: OpenF1Driver): number | null {
  const raw = d.driver_number;
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function labelFromOpenF1Row(d: OpenF1Driver, n: number): string {
  if (typeof d.full_name === "string" && d.full_name.trim()) return d.full_name.trim();
  if (typeof d.broadcast_name === "string" && d.broadcast_name.trim()) return d.broadcast_name.trim();
  if (typeof d.name_acronym === "string" && d.name_acronym.trim()) return d.name_acronym.trim();
  return `#${n}`;
}

async function fetchOpenF1DriversFromQuery(query: string): Promise<OpenF1DriverEntry[]> {
  const url = `${OPENF1}/drivers?${query}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const rows = (await res.json()) as OpenF1Driver[];
  if (!Array.isArray(rows)) return [];
  const out: OpenF1DriverEntry[] = [];
  for (const d of rows) {
    const n = driverNumberFromOpenF1Row(d);
    if (n == null) continue;
    out.push({ driverNumber: n, label: labelFromOpenF1Row(d, n) });
  }
  return out;
}

/**
 * Pilotos OpenF1 para la carrera. Si `session_key` aún no tiene parrilla (carreras futuras),
 * se reintenta con `meeting_key` del mismo fin de semana.
 */
export async function fetchOpenF1DriversForSession(
  sessionKey: number,
  meetingKey?: number | null
): Promise<OpenF1DriverEntry[]> {
  const byNum = new Map<number, OpenF1DriverEntry>();
  for (const e of await fetchOpenF1DriversFromQuery(`session_key=${sessionKey}`)) {
    byNum.set(e.driverNumber, e);
  }
  if (byNum.size === 0 && meetingKey != null && Number.isFinite(meetingKey)) {
    for (const e of await fetchOpenF1DriversFromQuery(`meeting_key=${meetingKey}`)) {
      byNum.set(e.driverNumber, e);
    }
  }
  return [...byNum.values()].sort((a, b) => a.driverNumber - b.driverNumber);
}

function isMainGrandPrixRace(s: OpenF1Session): boolean {
  return s.session_type === "Race" && s.session_name === "Race" && !s.is_cancelled;
}

export async function syncF1SeasonRaces(prisma: PrismaClient, year: number): Promise<number> {
  const url = `${OPENF1}/sessions?year=${year}&session_type=Race`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OpenF1 sessions ${year}: HTTP ${res.status}`);
  }
  const rows = (await res.json()) as OpenF1Session[];
  const main = rows.filter(isMainGrandPrixRace);
  main.sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());
  let n = 0;
  for (let i = 0; i < main.length; i++) {
    const s = main[i];
    const raceStartAt = new Date(s.date_start);
    await prisma.f1Race.upsert({
      where: { sessionKey: s.session_key },
      create: {
        sessionKey: s.session_key,
        meetingKey: s.meeting_key,
        year: s.year,
        roundOrder: i + 1,
        sessionName: s.session_name,
        circuitShortName: s.circuit_short_name ?? null,
        countryName: s.country_name ?? null,
        raceStartAt,
      },
      update: {
        meetingKey: s.meeting_key,
        year: s.year,
        roundOrder: i + 1,
        sessionName: s.session_name,
        circuitShortName: s.circuit_short_name ?? null,
        countryName: s.country_name ?? null,
        raceStartAt,
      },
    });
    n++;
  }
  return n;
}

export async function syncF1RaceResultForSession(prisma: PrismaClient, sessionKey: number): Promise<boolean> {
  const url = `${OPENF1}/session_result?session_key=${sessionKey}`;
  const res = await fetch(url);
  if (!res.ok) return false;
  const rows = (await res.json()) as OpenF1ResultRow[];
  const top = rows
    .filter((r) => r.position >= 1 && r.position <= 10 && Number.isFinite(r.driver_number))
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ position: r.position, driverNumber: r.driver_number }));
  if (top.length < 10) return false;
  await prisma.f1Race.updateMany({
    where: { sessionKey },
    data: {
      resultTop10: top,
      lastSyncedAt: new Date(),
    },
  });
  return true;
}

/** Sincroniza resultados top 10 para carreras ya finalizadas (sin resultado guardado). */
export async function syncF1FinishedRaceResults(prisma: PrismaClient): Promise<number> {
  const now = new Date();
  const races = await prisma.f1Race.findMany({
    where: { raceStartAt: { lt: now } },
    select: { sessionKey: true, resultTop10: true },
  });
  let ok = 0;
  for (const r of races) {
    if (r.resultTop10 != null && Array.isArray(r.resultTop10) && r.resultTop10.length >= 10) continue;
    const done = await syncF1RaceResultForSession(prisma, r.sessionKey);
    if (done) ok++;
  }
  return ok;
}
