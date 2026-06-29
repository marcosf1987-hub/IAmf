import type { Prisma, PrismaClient } from "@prisma/client";
import {
  GROUP_STAGE_SLOT_CODES,
  assignRoundOf32FromApi,
  type FootballDataMatch,
  type OurMatch,
  type OurMatchStage,
  fetchWorldCupMatches,
  filterApiMatchesNearOurMatches,
  getMatchScore,
  hasUsableApiTeamNames,
  isTerminalMatchStatus,
  mapScoreToOurMatch,
  needsNameFromApi,
  normalizeTeamName,
  resolveOurMatchFromApi,
  teamsPairEqual,
} from "./football-data";
import { repairCorruptedKnockoutMatches } from "./repair-knockout-matches";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

function isFullScanSyncEnv(): boolean {
  const v = process.env.FOOTBALL_DATA_SYNC_FULL_SCAN?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function pendingMatchWhere(): Prisma.MatchWhereInput {
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

export type FootballDataSyncStatus = {
  apiKeyConfigured: boolean;
  autoSyncEnabled: boolean;
  autoSyncIntervalMs: number;
  fullScanEnv: boolean;
  totalMatches: number;
  matchesWithResult: number;
  pendingRows: number;
};

export async function getFootballDataSyncStatus(prisma: PrismaClient): Promise<FootballDataSyncStatus> {
  const apiKeyConfigured = Boolean(process.env.FOOTBALL_DATA_API_KEY?.trim());
  const raw = process.env.FOOTBALL_DATA_AUTO_SYNC_INTERVAL_MS?.trim();
  const autoSyncIntervalMs =
    raw === "0" || raw === "false" ? 0 : Math.max(60_000, Number(raw) || DEFAULT_INTERVAL_MS);
  const [totalMatches, matchesWithResult, pendingRows] = await Promise.all([
    prisma.match.count(),
    prisma.match.count({
      where: { resultScoreA: { not: null }, resultScoreB: { not: null } },
    }),
    prisma.match.count({ where: pendingMatchWhere() }),
  ]);
  return {
    apiKeyConfigured,
    autoSyncEnabled: apiKeyConfigured && autoSyncIntervalMs > 0,
    autoSyncIntervalMs,
    fullScanEnv: isFullScanSyncEnv(),
    totalMatches,
    matchesWithResult,
    pendingRows,
  };
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
  /** Filas de eliminatoria restauradas desde placeholders del seed. */
  knockoutsRepaired: number;
  /** Marcadores borrados en filas con placeholders (1A vs 2B, etc.). */
  orphanScoresCleared: number;
  /** Partidos de 16avos actualizados desde API LAST_32. */
  roundOf32Synced: number;
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
    apiHome: normalizeTeamName(apiMatch.homeTeam.name) ?? "(sin nombre)",
    apiAway: normalizeTeamName(apiMatch.awayTeam.name) ?? "(sin nombre)",
    apiUtcDate: apiMatch.utcDate,
    apiStatus: apiMatch.status,
  };
}

export async function runFootballDataMatchSync(
  prisma: PrismaClient,
  options?: { fullScan?: boolean }
): Promise<ReturnType<typeof buildSyncMatchResultsHttpBody>> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error("missing_football_data_api_key") as Error & { code?: string };
    err.code = "missing_config";
    throw err;
  }
  const fullScan = options?.fullScan ?? true;
  const result = await syncMatchResultsFromFootballData(prisma, apiKey, { fullScan });
  return buildSyncMatchResultsHttpBody(result);
}

/** Una pasada: nombres reales (TBD + slots 1A/R32-1/… del seed) + marcadores finalizados desde football-data.org → BD. */
export async function syncMatchResultsFromFootballData(
  prisma: PrismaClient,
  apiKey: string,
  options?: { fullScan?: boolean }
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

  const fullScan = options?.fullScan ?? isFullScanSyncEnv();

  const repairResult = await repairCorruptedKnockoutMatches(prisma);

  let pendingRows: {
    id: string;
    teamA: string;
    teamB: string;
    kickoffAt: Date;
    stage: OurMatchStage;
    resultScoreA: number | null;
    resultScoreB: number | null;
  }[];

  if (fullScan) {
    pendingRows = await prisma.match.findMany({
      select: {
        id: true,
        teamA: true,
        teamB: true,
        kickoffAt: true,
        stage: true,
        resultScoreA: true,
        resultScoreB: true,
      },
    });
  } else {
    pendingRows = await prisma.match.findMany({
      where: pendingMatchWhere(),
      select: {
        id: true,
        teamA: true,
        teamB: true,
        kickoffAt: true,
        stage: true,
        resultScoreA: true,
        resultScoreB: true,
      },
    });
  }

  const pendingIds = new Set(pendingRows.map((m) => m.id));

  const allRows = await prisma.match.findMany({
    select: {
      id: true,
      teamA: true,
      teamB: true,
      kickoffAt: true,
      stage: true,
    },
  });

  if (!fullScan && pendingRows.length === 0) {
    return {
      updated: 0,
      totalApi: 0,
      apiMatchesConsidered: 0,
      teamsResolved: 0,
      pendingInDb: 0,
      knockoutsRepaired: repairResult.repaired,
      orphanScoresCleared: repairResult.scoresCleared,
      roundOf32Synced: 0,
      skippedFetch: true,
      diagnostics: emptyDiagnostics,
    };
  }

  const apiMatchesRaw = await fetchWorldCupMatches(apiKey);
  let apiMatches = apiMatchesRaw;
  if (!fullScan) {
    apiMatches = filterApiMatchesNearOurMatches(apiMatchesRaw, pendingRows);
  }

  const workingOur: OurMatch[] = allRows.map((m) => ({
    id: m.id,
    teamA: m.teamA,
    teamB: m.teamB,
    kickoffAt: m.kickoffAt,
    stage: m.stage as OurMatchStage,
  }));

  const diagnostics: SyncMatchDiagnostics = {
    ...emptyDiagnostics,
    finishedInApi: apiMatches.filter((m) => isTerminalMatchStatus(m.status)).length,
  };

  const pushSample = (sample: SyncDiagnosticSample) => {
    if (sample.kind === "no_match" || sample.kind === "no_score") {
      const failureCount = diagnostics.samples.filter((s) => s.kind !== "updated").length;
      if (failureCount < 8) {
        diagnostics.samples.unshift(sample);
      }
      return;
    }
    const updatedCount = diagnostics.samples.filter((s) => s.kind === "updated").length;
    if (updatedCount < MAX_DIAGNOSTIC_SAMPLES) {
      diagnostics.samples.push(sample);
    }
  };

  let updated = 0;
  let teamsResolved = 0;
  let roundOf32Synced = 0;

  const r32Assignments = assignRoundOf32FromApi(apiMatches, workingOur);
  for (const assignment of r32Assignments) {
    const teams = { teamA: assignment.teamA, teamB: assignment.teamB };
    const scores = mapScoreToOurMatch(assignment.apiMatch, teams);
    const hadPlaceholders =
      needsNameFromApi(assignment.ourMatch.teamA) || needsNameFromApi(assignment.ourMatch.teamB);
    const kickoffChanged =
      assignment.ourMatch.kickoffAt.getTime() !== assignment.kickoffAt.getTime();

    const data: {
      teamA: string;
      teamB: string;
      kickoffAt: Date;
      resultScoreA?: number;
      resultScoreB?: number;
    } = {
      teamA: teams.teamA,
      teamB: teams.teamB,
      kickoffAt: assignment.kickoffAt,
    };
    if (scores) {
      data.resultScoreA = scores.scoreA;
      data.resultScoreB = scores.scoreB;
    }

    const changed =
      hadPlaceholders ||
      kickoffChanged ||
      scores != null ||
      !teamsPairEqual(assignment.ourMatch.teamA, assignment.ourMatch.teamB, teams.teamA, teams.teamB);

    if (!changed) continue;

    await prisma.match.update({
      where: { id: assignment.ourMatch.id },
      data,
    });
    updated++;
    roundOf32Synced++;
    if (hadPlaceholders) {
      teamsResolved++;
      diagnostics.teamsFilled++;
    }
    if (scores) diagnostics.scoresWritten++;
    diagnostics.matched++;

    const row = workingOur.find((m) => m.id === assignment.ourMatch.id);
    if (row) {
      row.teamA = teams.teamA;
      row.teamB = teams.teamB;
      row.kickoffAt = assignment.kickoffAt;
    }

    pushSample({
      kind: "updated",
      ...apiSampleBase(assignment.apiMatch),
      ourTeamA: teams.teamA,
      ourTeamB: teams.teamB,
      ourKickoff: assignment.kickoffAt.toISOString(),
      resultScoreA: scores?.scoreA,
      resultScoreB: scores?.scoreB,
    });
  }

  const r32OurIds = new Set(r32Assignments.map((a) => a.ourMatch.id));

  for (const apiMatch of apiMatches) {
    if (!hasUsableApiTeamNames(apiMatch)) continue;

    let resolved: ReturnType<typeof resolveOurMatchFromApi>;
    try {
      resolved = resolveOurMatchFromApi(apiMatch, workingOur);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[football-data] sync skip match", apiMatch.id, err);
      continue;
    }
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

    if (r32OurIds.has(resolved.ourMatch.id)) {
      continue;
    }

    if (!pendingIds.has(resolved.ourMatch.id)) {
      continue;
    }

    diagnostics.matched++;

    const teams =
      resolved.kind === "exact"
        ? { teamA: resolved.ourMatch.teamA, teamB: resolved.ourMatch.teamB }
        : { teamA: resolved.teamA, teamB: resolved.teamB };

    const scores = mapScoreToOurMatch(apiMatch, teams);
    const data: {
      teamA?: string;
      teamB?: string;
      kickoffAt?: Date;
      resultScoreA?: number;
      resultScoreB?: number;
    } = {};

    if (resolved.kind === "fill_teams") {
      data.teamA = teams.teamA;
      data.teamB = teams.teamB;
      if (resolved.kickoffAt) data.kickoffAt = resolved.kickoffAt;
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
      if (data.kickoffAt) row.kickoffAt = data.kickoffAt;
    }
  }

  return {
    updated,
    totalApi: apiMatchesRaw.length,
    apiMatchesConsidered: apiMatches.length,
    teamsResolved,
    pendingInDb: pendingRows.length,
    knockoutsRepaired: repairResult.repaired,
    orphanScoresCleared: repairResult.scoresCleared,
    roundOf32Synced,
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
  knockoutsRepaired: number;
  orphanScoresCleared: number;
  roundOf32Synced: number;
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
    knockoutsRepaired,
    orphanScoresCleared,
    roundOf32Synced,
    skippedFetch,
    diagnostics,
  } = result;

  const repairNote =
    knockoutsRepaired > 0 ? `${knockoutsRepaired} slot(s) de eliminatoria restaurado(s). ` : "";
  const orphanNote =
    orphanScoresCleared > 0 ? `${orphanScoresCleared} marcador(es) huérfano(s) limpiado(s). ` : "";
  const r32Note =
    roundOf32Synced > 0 ? `${roundOf32Synced} partido(s) de 16avos desde API. ` : "";

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
    knockoutsRepaired,
    orphanScoresCleared,
    roundOf32Synced,
    skippedFetch,
    diagnostics,
    message: `${repairNote}${orphanNote}${r32Note}Actualizado: ${updated} fila(s) (${teamsResolved} reemplazo(s) TBD). ${detail}`,
  };
}

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
