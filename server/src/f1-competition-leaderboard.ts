import type { PrismaClient } from "@prisma/client";
import { anonymizeUserId } from "./leaderboard";
import { aggregateF1PointsByUser, officialTop10DriverNumbers } from "./f1-scoring";

export type F1LeagueLeaderboardRow = {
  userId: string;
  alias: string;
  hits: number;
  rank: number;
  rankChange: number;
};

export type F1RaceForScoringRow = {
  id: string;
  resultTop10: unknown;
  sessionKey: number;
  circuitShortName: string | null;
  roundOrder: number;
};

/** Carreras F1 con top 10 oficial completo (misma condición que el scoring). */
export async function loadF1RacesForScoring(prisma: PrismaClient): Promise<F1RaceForScoringRow[]> {
  const racesAll = await prisma.f1Race.findMany({
    select: {
      id: true,
      resultTop10: true,
      sessionKey: true,
      circuitShortName: true,
      roundOrder: true,
    },
  });
  return racesAll.filter((r) => {
    const top = officialTop10DriverNumbers(r.resultTop10);
    return top.length === 10 && top.every((n) => n > 0);
  });
}

/**
 * Ranking de liga F1: `hits` en la respuesta del dashboard = puntos F1 (misma forma que aciertos en fútbol).
 */
export function buildF1LeagueLeaderboardRows(
  memberIds: string[],
  totals: Map<string, number>,
  memberUsers: Array<{ id: string; fullName: string | null; email: string }>,
  anonymizeCompetition: boolean,
  companyIdForAnonymization: string,
  currentUserId: string
): {
  leaderboard: F1LeagueLeaderboardRow[];
  myRank: number | null;
  totalParticipants: number;
} {
  const userById = new Map(memberUsers.map((u) => [u.id, u]));
  const sorted = [...memberIds]
    .map((uid) => ({ userId: uid, points: totals.get(uid) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
  const leaderboard: F1LeagueLeaderboardRow[] = sorted.map((row, i) => {
    const u = userById.get(row.userId);
    const alias =
      anonymizeCompetition && u
        ? anonymizeUserId(row.userId, companyIdForAnonymization)
        : u?.fullName?.trim() || u?.email || "Usuario";
    return {
      userId: row.userId,
      alias,
      hits: row.points,
      rank: i + 1,
      rankChange: 0,
    };
  });
  const myEntry = leaderboard.find((r) => r.userId === currentUserId);
  return {
    leaderboard,
    myRank: myEntry?.rank ?? null,
    totalParticipants: memberIds.length,
  };
}

export async function f1TotalsForMembers(
  prisma: PrismaClient,
  memberIds: string[],
  races: Array<{ id: string; resultTop10: unknown }>
): Promise<Map<string, number>> {
  if (memberIds.length === 0 || races.length === 0) {
    return new Map();
  }
  const preds = await prisma.f1Prediction.findMany({
    where: { userId: { in: memberIds } },
    select: { userId: true, raceId: true, placements: true },
  });
  return aggregateF1PointsByUser(races, preds);
}
