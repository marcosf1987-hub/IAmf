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
};

export type OpenF1DriverEntry = { driverNumber: number; label: string };

/** Pilotos de la sesión (OpenF1); para prompts IA y API pública. */
export async function fetchOpenF1DriversForSession(sessionKey: number): Promise<OpenF1DriverEntry[]> {
  const url = `${OPENF1}/drivers?session_key=${sessionKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const rows = (await res.json()) as OpenF1Driver[];
  if (!Array.isArray(rows)) return [];
  const out: OpenF1DriverEntry[] = [];
  for (const d of rows) {
    const n = typeof d.driver_number === "number" ? d.driver_number : parseInt(String(d.driver_number), 10);
    if (!Number.isFinite(n) || n < 1) continue;
    const label =
      typeof d.full_name === "string" && d.full_name.trim()
        ? d.full_name.trim()
        : typeof d.name_acronym === "string" && d.name_acronym.trim()
          ? d.name_acronym.trim()
          : `#${n}`;
    out.push({ driverNumber: n, label });
  }
  out.sort((a, b) => a.driverNumber - b.driverNumber);
  return out;
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
