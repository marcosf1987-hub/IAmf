import type { Prisma, PrismaClient } from "@prisma/client";
import {
  GROUP_STAGE_SLOT_CODES,
  type FootballDataMatch,
  fetchWorldCupMatches,
  filterApiMatchesNearOurMatches,
  getMatchScore,
  isTerminalMatchStatus,
  mapScoreToOurMatch,
  normalizeTeamName,
  resolveOurMatchFromApi,
} from "./football-data";

function pendingMatchWhere(): Prisma.MatchWhereInput {
  const bracketPrefixes = ["R32-", "R16-", "QF-", "SF-"] as const;
  return {
    OR: [
      { resultScoreA: null },
      { resultScoreB: null },
      { teamA: "TBD" },
      { teamB: "TBD" },
      { teamA: { in: [...GROUP_STAGE_SLOT_CODES] } },
      { teamB: { in: [...GROUP_STAGE_SLOT_CODES] } },
      ...bracketPrefixes.flatMap((p) => [{ teamA: { startsWith: p } }, { teamB: { startsWith: p } }]),
    ],
  };
}

function isFullScanSync(): boolean {
  const v = process.env.FOOTBALL_DATA_SYNC_FULL_SCAN?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export type SyncDiagnosticSample = {
  kind: "no_match" | "no_score" | "updated";
  apiHome: string;
  apiAway: string;
  apiUtcDate: string;
  apiStatus: string;
  ourTeamA?: string;
  ourTeamB?: string;
  ourKickoff?: string;
  resultScoreA?: number;
  resultScoreB?: number;
  reason?: string;
};

export type SyncMatchDiagnostics = {
  finishedInApi: number;
  matched: number;
  scoresWritten: number;
  teamsFilled: number;
  skippedNoMatch: number;
  skippedNoScore: number;
  samples: SyncDiagnosticSample[];
};

export type SyncMatchResultsResult = {
  updated: number;
  /** Partidos devueltos por la API (siempre tras `fetch`). */
  totalApi: number;
  /** Partidos de la API considerados en el bucle (tras filtro por ventana en modo acotado). */
  apiMatchesConsidered: number;
  teamsResolved: number;
  pendingInDb: number;
  /** No hubo filas pendientes: no se llamó a la API. */
  skippedFetch: boolean;
  diagnostics: SyncMatchDiagnostics;
};

const MAX_DIAGNOSTIC_SAMPLES = 12;

function apiSampleBase(apiMatch: FootballDataMatch): Pick<
  SyncDiagnosticSample,
  "apiHome" | "apiAway" | "apiUtcDate" | "apiStatus"
> {
  return {
    apiHome: normalizeTeamName(apiMatch.homeTeam.name),
    apiAway: normalizeTeamName(apiMatch.awayTeam.name),
    apiUtcDate: apiMatch.utcDate,
    apiStatus: apiMatch.status,
  };
}

/** Una pasada: nombres reales (TBD + slots 1A/R32-1/… del seed) + marcadores finalizados desde football-data.org → BD. */
export async function syncMatchResultsFromFootballData(
  prisma: PrismaClient,
  apiKey: string
): Promise<SyncMatchResultsResult> {
  const emptyDiagnostics: SyncMatchDiagnostics = {
    finishedInApi: 0,
    matched: 0,
    scoresWritten: 0,
    teamsFilled: 0,
    skippedNoMatch: 0,
    skippedNoScore: 0,
    samples: [],
  };

  const fullScan = isFullScanSync();

  let ourMatches: {
    id: string;
    teamA: string;
    teamB: string;
    kickoffAt: Date;
    resultScoreA: number | null;
    resultScoreB: number | null;
  }[];

  if (fullScan) {
    ourMatches = await prisma.match.findMany({
      select: {
        id: true,
        teamA: true,
        teamB: true,
        kickoffAt: true,
        resultScoreA: true,
        resultScoreB: true,
      },
    });
  } else {
    ourMatches = await prisma.match.findMany({
      where: pendingMatchWhere(),
      select: {
        id: true,
        teamA: true,
        teamB: true,
        kickoffAt: true,
        resultScoreA: true,
        resultScoreB: true,
      },
    });
  }

  if (!fullScan && ourMatches.length === 0) {
    return {
      updated: 0,
      totalApi: 0,
      apiMatchesConsidered: 0,
      teamsResolved: 0,
      pendingInDb: 0,
      skippedFetch: true,
      diagnostics: emptyDiagnostics,
    };
  }

  const apiMatchesRaw = await fetchWorldCupMatches(apiKey);
  let apiMatches = apiMatchesRaw;
  if (!fullScan) {
    apiMatches = filterApiMatchesNearOurMatches(apiMatchesRaw, ourMatches);
  }

  const workingOur = ourMatches.map((m) => ({
    id: m.id,
    teamA: m.teamA,
    teamB: m.teamB,
    kickoffAt: m.kickoffAt,
  }));

  const diagnostics: SyncMatchDiagnostics = {
    ...emptyDiagnostics,
    finishedInApi: apiMatches.filter((m) => isTerminalMatchStatus(m.status)).length,
  };

  const pushSample = (sample: SyncDiagnosticSample) => {
    if (diagnostics.samples.length < MAX_DIAGNOSTIC_SAMPLES) {
      diagnostics.samples.push(sample);
    }
  };

  let updated = 0;
  let teamsResolved = 0;
  for (const apiMatch of apiMatches) {
    const resolved = resolveOurMatchFromApi(apiMatch, workingOur);
    if (!resolved) {
      if (isTerminalMatchStatus(apiMatch.status)) {
        diagnostics.skippedNoMatch++;
        pushSample({
          kind: "no_match",
          ...apiSampleBase(apiMatch),
          reason: "Sin fila en BD con mismos equipos/fecha",
        });
      }
      continue;
    }

    diagnostics.matched++;

    const teams =
      resolved.kind === "exact"
        ? { teamA: resolved.ourMatch.teamA, teamB: resolved.ourMatch.teamB }
        : { teamA: resolved.teamA, teamB: resolved.teamB };

    const scores = mapScoreToOurMatch(apiMatch, teams);
    const data: { teamA?: string; teamB?: string; resultScoreA?: number; resultScoreB?: number } = {};

    if (resolved.kind === "fill_teams") {
      data.teamA = teams.teamA;
      data.teamB = teams.teamB;
      teamsResolved++;
      diagnostics.teamsFilled++;
    }
    if (scores) {
      data.resultScoreA = scores.scoreA;
      data.resultScoreB = scores.scoreB;
    }

    if (Object.keys(data).length === 0) {
      if (isTerminalMatchStatus(apiMatch.status)) {
        diagnostics.skippedNoScore++;
        const score = getMatchScore(apiMatch);
        pushSample({
          kind: "no_score",
          ...apiSampleBase(apiMatch),
          ourTeamA: resolved.ourMatch.teamA,
          ourTeamB: resolved.ourMatch.teamB,
          ourKickoff: resolved.ourMatch.kickoffAt.toISOString(),
          reason: score
            ? "Marcador API no mapeó al orden teamA/teamB"
            : `Estado ${apiMatch.status} sin marcador usable en la API`,
        });
      }
      continue;
    }

    await prisma.match.update({
      where: { id: resolved.ourMatch.id },
      data,
    });
    updated++;

    if (scores) {
      diagnostics.scoresWritten++;
      pushSample({
        kind: "updated",
        ...apiSampleBase(apiMatch),
        ourTeamA: teams.teamA,
        ourTeamB: teams.teamB,
        ourKickoff: resolved.ourMatch.kickoffAt.toISOString(),
        resultScoreA: scores.scoreA,
        resultScoreB: scores.scoreB,
      });
    }

    const row = workingOur.find((m) => m.id === resolved.ourMatch.id);
    if (row) {
      row.teamA = teams.teamA;
      row.teamB = teams.teamB;
    }
  }

  return {
    updated,
    totalApi: apiMatchesRaw.length,
    apiMatchesConsidered: apiMatches.length,
    teamsResolved,
    pendingInDb: ourMatches.length,
    skippedFetch: false,
    diagnostics,
  };
}

export function buildSyncMatchResultsHttpBody(result: SyncMatchResultsResult): {
  ok: true;
  updated: number;
  totalApi: number;
  apiMatchesConsidered: number;
  teamsResolved: number;
  pendingInDb: number;
  skippedFetch: boolean;
  diagnostics: SyncMatchDiagnostics;
  message: string;
} {
  const {
    updated,
    totalApi,
    apiMatchesConsidered,
    teamsResolved,
    pendingInDb,
    skippedFetch,
    diagnostics,
  } = result;

  const detail = skippedFetch
    ? "Sin filas pendientes; no se llamó a la API."
    : `${pendingInDb} fila(s) pendiente(s) en BD, ${apiMatchesConsidered}/${totalApi} partido(s) API en ventana. Diagnóstico: ${diagnostics.finishedInApi} FINISHED/AWARDED en API, ${diagnostics.matched} emparejados, ${diagnostics.scoresWritten} marcadores escritos, ${diagnostics.skippedNoMatch} sin pareja, ${diagnostics.skippedNoScore} sin marcador.`;

  return {
    ok: true,
    updated,
    totalApi,
    apiMatchesConsidered,
    teamsResolved,
    pendingInDb,
    skippedFetch,
    diagnostics,
    message: `Actualizado: ${updated} fila(s) (${teamsResolved} reemplazo(s) TBD). ${detail}`,
  };
}

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Cada N ms (default 5 min) una llamada a la API: ~0,2 req/min, muy por debajo del límite gratuito (10/min).
 * Desactivar: FOOTBALL_DATA_AUTO_SYNC_INTERVAL_MS=0 o no definir FOOTBALL_DATA_API_KEY.
 */
export function startFootballDataResultAutoSync(prisma: PrismaClient): void {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log(
      "[football-data] FOOTBALL_DATA_API_KEY no definida; auto-sync de resultados desactivado."
    );
    return;
  }

  const raw = process.env.FOOTBALL_DATA_AUTO_SYNC_INTERVAL_MS?.trim();
  const intervalMs =
    raw === "0" || raw === "false"
      ? 0
      : Math.max(60_000, Number(raw) || DEFAULT_INTERVAL_MS);

  if (intervalMs === 0) {
    // eslint-disable-next-line no-console
    console.log(
      "[football-data] Auto-sync desactivado (FOOTBALL_DATA_AUTO_SYNC_INTERVAL_MS=0)."
    );
    return;
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await syncMatchResultsFromFootballData(prisma, apiKey);
      if (r.updated > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[football-data] Auto-sync: ${r.updated} fila(s), ${r.teamsResolved} nombres (TBD/bracket) — API ${r.apiMatchesConsidered}/${r.totalApi} pendientes BD ${r.pendingInDb}.`
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[football-data] Auto-sync error:", err);
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(tick, intervalMs);
  // eslint-disable-next-line no-console
  console.log(
    `[football-data] Auto-sync cada ${intervalMs / 60_000} min (plan gratuito: hasta 10 req/min en football-data.org).`
  );
}
