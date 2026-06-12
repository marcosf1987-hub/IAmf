/**
 * Cliente para football-data.org (API gratuita de resultados de fútbol).
 * https://www.football-data.org/
 * Plan gratuito: 10 llamadas/min, 12 competiciones.
 * FIFA World Cup 2026: competition code WC, season 2026.
 */

const API_BASE = "https://api.football-data.org/v4";
const WC_COMPETITION = "WC";
const WC_SEASON = "2026";

/** Goles por lado; v4 usa `home`/`away`, versiones anteriores `homeTeam`/`awayTeam`. */
export type FootballDataScoreSide = {
  home?: number | null;
  away?: number | null;
  homeTeam?: number | null;
  awayTeam?: number | null;
};

export type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { id: number; name: string | null };
  awayTeam: { id: number; name: string | null };
  score?: {
    fullTime?: FootballDataScoreSide;
    regularTime?: FootballDataScoreSide;
  };
};

function readScoreSide(side: FootballDataScoreSide | undefined): { home: number; away: number } | null {
  if (!side) return null;
  const home = side.home ?? side.homeTeam;
  const away = side.away ?? side.awayTeam;
  if (home == null || away == null) return null;
  return { home, away };
}

export type FootballDataMatchesResponse = {
  matches?: FootballDataMatch[];
};

/** Mapeo de nombres API -> nuestros nombres en BD (para diferencias) */
const TEAM_NAME_MAP: Record<string, string> = {
  "Bosnia and Herzegovina": "Bosnia",
  "Korea Republic": "South Korea",
  "Côte d'Ivoire": "Ivory Coast",
  "IR Iran": "Iran",
  "Cabo Verde": "Cape Verde",
  Czechia: "Czech Republic",
  Türkiye: "Turkey",
  Turkiye: "Turkey",
  "Congo DR": "DR Congo",
  "Democratic Republic of Congo": "DR Congo",
  "United States": "USA",
  "United States of America": "USA",
};

const PLACEHOLDER_TBD = "TBD";

/** Estados en los que football-data.org expone marcador final usable. */
export const TERMINAL_MATCH_STATUSES = new Set(["FINISHED", "AWARDED"]);

export function isTerminalMatchStatus(status: string): boolean {
  return TERMINAL_MATCH_STATUSES.has(status);
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Nombre canónico para comparar equipos (acentos, mayúsculas, alias API). */
export function canonicalTeamName(name: string | null | undefined): string {
  const normalized = normalizeTeamName(name);
  if (!normalized) return "";
  return stripDiacritics(normalized).trim().toLowerCase();
}

export function normalizeTeamName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  return TEAM_NAME_MAP[trimmed] ?? trimmed;
}

export function hasUsableApiTeamNames(apiMatch: FootballDataMatch): boolean {
  const home = normalizeTeamName(apiMatch.homeTeam.name);
  const away = normalizeTeamName(apiMatch.awayTeam.name);
  return Boolean(home && away && home !== PLACEHOLDER_TBD && away !== PLACEHOLDER_TBD);
}

export function teamsPairEqual(
  ourTeamA: string,
  ourTeamB: string,
  apiHome: string | null | undefined,
  apiAway: string | null | undefined
): boolean {
  const home = normalizeTeamName(apiHome);
  const away = normalizeTeamName(apiAway);
  if (!home || !away) return false;
  const a = canonicalTeamName(ourTeamA);
  const b = canonicalTeamName(ourTeamB);
  const homeKey = canonicalTeamName(home);
  const awayKey = canonicalTeamName(away);
  return (a === homeKey && b === awayKey) || (a === awayKey && b === homeKey);
}

/**
 * Obtiene los partidos del Mundial 2026 desde football-data.org.
 * Requiere FOOTBALL_DATA_API_KEY en .env (gratis en https://www.football-data.org/)
 */
export async function fetchWorldCupMatches(apiKey: string): Promise<FootballDataMatch[]> {
  const url = `${API_BASE}/competitions/${WC_COMPETITION}/matches?season=${WC_SEASON}`;
  const res = await fetch(url, {
    headers: {
      "X-Auth-Token": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`football-data.org: ${res.status} - ${text || res.statusText}`);
  }

  const data = (await res.json()) as FootballDataMatchesResponse;
  return data.matches ?? [];
}

export type OurMatch = { id: string; teamA: string; teamB: string; kickoffAt: Date };

/**
 * Encuentra nuestro match por equipos y fecha.
 * teamA/teamB en nuestra BD pueden estar en cualquier orden vs home/away en la API.
 */
export function findMatchingOurMatch(
  apiMatch: FootballDataMatch,
  ourMatches: OurMatch[]
): OurMatch | null {
  const home = normalizeTeamName(apiMatch.homeTeam.name);
  const away = normalizeTeamName(apiMatch.awayTeam.name);
  if (!home || !away) return null;
  const apiDate = new Date(apiMatch.utcDate).toISOString().slice(0, 10);

  for (const m of ourMatches) {
    const ourDate = new Date(m.kickoffAt).toISOString().slice(0, 10);
    if (ourDate !== apiDate) continue;
    if (teamsPairEqual(m.teamA, m.teamB, home, away)) return m;
  }
  return null;
}

/** Ventana para alinear kickoff en BD vs API (zonas horarias del Mundial). */
export const FOOTBALL_DATA_KICKOFF_TOLERANCE_MS = 36 * 60 * 60 * 1000;

/** Slots tipo 1A/2B, R32-1, R16-1… (seed de eliminatorias hasta que la API asigna rivales reales). */
export function isBracketSlotPlaceholder(name: string): boolean {
  if (name === PLACEHOLDER_TBD) return false;
  if (/^[123][A-L]$/.test(name)) return true;
  if (/^R32-\d+$/.test(name)) return true;
  if (/^R16-\d+$/.test(name)) return true;
  if (/^QF-\d+$/.test(name)) return true;
  if (/^SF-\d+$/.test(name)) return true;
  return false;
}

const GROUP_LETTERS = "ABCDEFGHIJKL";

/** Códigos 1A…3L (misma convención que `isBracketSlotPlaceholder`). */
export const GROUP_STAGE_SLOT_CODES: readonly string[] = [1, 2, 3].flatMap((n) =>
  [...GROUP_LETTERS].map((l) => `${n}${l}`)
);

export function needsNameFromApi(name: string): boolean {
  return name === PLACEHOLDER_TBD || isBracketSlotPlaceholder(name);
}

/**
 * Empareja por par de equipos cuando el cruce es único en nuestra lista
 * (p. ej. kickoff en BD distinto al utcDate de la API).
 */
export function findUniqueOurMatchByTeams(
  apiMatch: FootballDataMatch,
  ourMatches: OurMatch[]
): OurMatch | null {
  const home = normalizeTeamName(apiMatch.homeTeam.name);
  const away = normalizeTeamName(apiMatch.awayTeam.name);
  if (!home || !away || home === PLACEHOLDER_TBD || away === PLACEHOLDER_TBD) return null;

  const hits = ourMatches.filter(
    (m) =>
      !needsNameFromApi(m.teamA) &&
      !needsNameFromApi(m.teamB) &&
      teamsPairEqual(m.teamA, m.teamB, home, away)
  );
  if (hits.length === 1) return hits[0];
  return null;
}

/** Fila que aún debe intentar alinearse con football-data.org (marcadores o nombres placeholder). */
export function matchRowNeedsFootballDataSync(row: {
  teamA: string;
  teamB: string;
  resultScoreA: number | null;
  resultScoreB: number | null;
}): boolean {
  if (row.resultScoreA == null || row.resultScoreB == null) return true;
  return needsNameFromApi(row.teamA) || needsNameFromApi(row.teamB);
}

/**
 * Reduce partidos API a una ventana temporal alrededor de nuestros kickoffs pendientes
 * (misma tolerancia que el emparejamiento). Si no hay filas, devuelve [].
 */
export function filterApiMatchesNearOurMatches(
  apiMatches: FootballDataMatch[],
  ourMatches: { kickoffAt: Date }[],
  padMs = FOOTBALL_DATA_KICKOFF_TOLERANCE_MS
): FootballDataMatch[] {
  if (ourMatches.length === 0) return [];
  const ts = ourMatches.map((m) => new Date(m.kickoffAt).getTime());
  const lo = Math.min(...ts) - padMs;
  const hi = Math.max(...ts) + padMs;
  return apiMatches.filter((am) => {
    const t = new Date(am.utcDate).getTime();
    return t >= lo && t <= hi;
  });
}

export type ResolvedOurMatch =
  | { kind: "exact"; ourMatch: OurMatch }
  /** Sustituye TBD y/o slots de bracket por los nombres que devuelve football-data.org (grupos + R32, octavos, etc.). */
  | { kind: "fill_teams"; ourMatch: OurMatch; teamA: string; teamB: string };

/**
 * Empareja un partido de la API con nuestra fila por fecha/hora y equipos:
 * - coincidencia exacta de nombres;
 * - o completar TBD / placeholders de cruces (1A, R32-1…) cuando la API ya trae selecciones reales.
 */
export function resolveOurMatchFromApi(
  apiMatch: FootballDataMatch,
  ourMatches: OurMatch[],
  kickoffToleranceMs = FOOTBALL_DATA_KICKOFF_TOLERANCE_MS
): ResolvedOurMatch | null {
  const home = normalizeTeamName(apiMatch.homeTeam.name);
  const away = normalizeTeamName(apiMatch.awayTeam.name);
  if (!home || !away || home === PLACEHOLDER_TBD || away === PLACEHOLDER_TBD) return null;

  const apiTime = new Date(apiMatch.utcDate).getTime();
  const inTol = (m: OurMatch) =>
    Math.abs(new Date(m.kickoffAt).getTime() - apiTime) <= kickoffToleranceMs;

  const candidates = ourMatches.filter(inTol);
  if (candidates.length === 0) return null;

  for (const m of candidates) {
    if (teamsPairEqual(m.teamA, m.teamB, home, away)) {
      return { kind: "exact", ourMatch: m };
    }
  }

  const fills: ResolvedOurMatch[] = [];
  for (const m of candidates) {
    const a = m.teamA;
    const b = m.teamB;
    const na = needsNameFromApi(a);
    const nb = needsNameFromApi(b);
    if (!na && !nb) continue;

    if (na && nb) {
      fills.push({ kind: "fill_teams", ourMatch: m, teamA: home, teamB: away });
      continue;
    }
    if (!na && nb) {
      if (canonicalTeamName(a) === canonicalTeamName(home)) {
        fills.push({ kind: "fill_teams", ourMatch: m, teamA: home, teamB: away });
      } else if (canonicalTeamName(a) === canonicalTeamName(away)) {
        fills.push({ kind: "fill_teams", ourMatch: m, teamA: away, teamB: home });
      }
    } else if (na && !nb) {
      if (canonicalTeamName(b) === canonicalTeamName(home)) {
        fills.push({ kind: "fill_teams", ourMatch: m, teamA: away, teamB: home });
      } else if (canonicalTeamName(b) === canonicalTeamName(away)) {
        fills.push({ kind: "fill_teams", ourMatch: m, teamA: home, teamB: away });
      }
    }
  }

  if (fills.length === 1) return fills[0];

  const byDate = findMatchingOurMatch(apiMatch, ourMatches);
  if (byDate) return { kind: "exact", ourMatch: byDate };

  const unique = findUniqueOurMatchByTeams(apiMatch, ourMatches);
  if (unique) return { kind: "exact", ourMatch: unique };

  return null;
}

/**
 * Extrae el resultado a 90 min (regularTime si hay prórroga, sino fullTime).
 */
export function getMatchScore(apiMatch: FootballDataMatch): { home: number; away: number } | null {
  if (!isTerminalMatchStatus(apiMatch.status)) return null;
  const score = apiMatch.score;
  if (!score) return null;

  return readScoreSide(score.regularTime) ?? readScoreSide(score.fullTime);
}

/**
 * Dado un match de la API y nuestro match, devuelve scoreA y scoreB en orden teamA-teamB.
 */
export function mapScoreToOurMatch(
  apiMatch: FootballDataMatch,
  ourMatch: { teamA: string; teamB: string }
): { scoreA: number; scoreB: number } | null {
  const s = getMatchScore(apiMatch);
  if (!s) return null;

  const home = normalizeTeamName(apiMatch.homeTeam.name);
  const away = normalizeTeamName(apiMatch.awayTeam.name);
  if (!home || !away) return null;

  if (teamsPairEqual(ourMatch.teamA, ourMatch.teamB, home, away)) {
    if (canonicalTeamName(ourMatch.teamA) === canonicalTeamName(home)) {
      return { scoreA: s.home, scoreB: s.away };
    }
    return { scoreA: s.away, scoreB: s.home };
  }
  return null;
}
