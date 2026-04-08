import type { PrismaClient } from "@prisma/client";
import {
  fetchWorldCupMatches,
  mapScoreToOurMatch,
  resolveOurMatchFromApi,
} from "./football-data";

/** Una pasada: nombres reales (sustituye TBD del seed) + resultados finalizados desde football-data.org → BD. */
export async function syncMatchResultsFromFootballData(
  prisma: PrismaClient,
  apiKey: string
): Promise<{ updated: number; totalApi: number; teamsResolved: number }> {
  const [apiMatches, ourMatches] = await Promise.all([
    fetchWorldCupMatches(apiKey),
    prisma.match.findMany({
      select: { id: true, teamA: true, teamB: true, kickoffAt: true },
    }),
  ]);

  let updated = 0;
  let teamsResolved = 0;
  for (const apiMatch of apiMatches) {
    const resolved = resolveOurMatchFromApi(apiMatch, ourMatches);
    if (!resolved) continue;

    const teams =
      resolved.kind === "exact"
        ? { teamA: resolved.ourMatch.teamA, teamB: resolved.ourMatch.teamB }
        : { teamA: resolved.teamA, teamB: resolved.teamB };

    const scores = mapScoreToOurMatch(apiMatch, teams);
    const data: { teamA?: string; teamB?: string; resultScoreA?: number; resultScoreB?: number } = {};

    if (resolved.kind === "fill_tbd") {
      data.teamA = teams.teamA;
      data.teamB = teams.teamB;
      teamsResolved++;
    }
    if (scores) {
      data.resultScoreA = scores.scoreA;
      data.resultScoreB = scores.scoreB;
    }

    if (Object.keys(data).length === 0) continue;

    await prisma.match.update({
      where: { id: resolved.ourMatch.id },
      data,
    });
    updated++;

    const row = ourMatches.find((m) => m.id === resolved.ourMatch.id);
    if (row) {
      row.teamA = teams.teamA;
      row.teamB = teams.teamB;
    }
  }

  return { updated, totalApi: apiMatches.length, teamsResolved };
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
      const { updated, totalApi, teamsResolved } = await syncMatchResultsFromFootballData(
        prisma,
        apiKey
      );
      if (updated > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[football-data] Auto-sync: ${updated} fila(s) tocada(s), ${teamsResolved} con TBD→equipos (${totalApi} en API).`
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
