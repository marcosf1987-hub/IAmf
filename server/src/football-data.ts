/**
 * Cliente para football-data.org (API gratuita de resultados de fútbol).
 * https://www.football-data.org/
 * Plan gratuito: 10 llamadas/min, 12 competiciones.
 * FIFA World Cup 2026: competition code WC, season 2026.
 */

const API_BASE = "https://api.football-data.org/v4";
const WC_COMPETITION = "WC";
const WC_SEASON = "2026";

export type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  score?: {
    fullTime?: { homeTeam: number; awayTeam: number };
    regularTime?: { homeTeam: number; awayTeam: number };
  };
};

export type FootballDataMatchesResponse = {
  matches?: FootballDataMatch[];
};

/** Mapeo de nombres API -> nuestros nombres en BD (para diferencias) */
const TEAM_NAME_MAP: Record<string, string> = {
  "Korea Republic": "South Korea",
  "Côte d'Ivoire": "Ivory Coast",
  "IR Iran": "Iran",
  "Cabo Verde": "Cape Verde",
};

function normalizeTeamName(name: string): string {
  return TEAM_NAME_MAP[name] ?? name;
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
  const apiDate = new Date(apiMatch.utcDate).toISOString().slice(0, 10);

  for (const m of ourMatches) {
    const ourDate = new Date(m.kickoffAt).toISOString().slice(0, 10);
    if (ourDate !== apiDate) continue;

    const aMatch =
      (m.teamA === home && m.teamB === away) || (m.teamA === away && m.teamB === home);
    if (aMatch) return m;
  }
  return null;
}

/**
 * Extrae el resultado a 90 min (regularTime si hay prórroga, sino fullTime).
 */
export function getMatchScore(apiMatch: FootballDataMatch): { home: number; away: number } | null {
  if (apiMatch.status !== "FINISHED") return null;
  const score = apiMatch.score;
  if (!score) return null;

  const s = score.regularTime ?? score.fullTime;
  if (!s || s.homeTeam == null || s.awayTeam == null) return null;
  return { home: s.homeTeam, away: s.awayTeam };
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

  if (ourMatch.teamA === home && ourMatch.teamB === away) {
    return { scoreA: s.home, scoreB: s.away };
  }
  if (ourMatch.teamA === away && ourMatch.teamB === home) {
    return { scoreA: s.away, scoreB: s.home };
  }
  return null;
}
