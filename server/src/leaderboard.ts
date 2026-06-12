import crypto from "crypto";

export type AnonymizeLabel = "Empleado" | "Jugador";

export function anonymizeUserId(
  userId: string,
  companyId: string,
  label: AnonymizeLabel = "Empleado"
): string {
  const hash = crypto.createHash("sha256").update(`${userId}-${companyId}`).digest("hex");
  const num = parseInt(hash.slice(0, 8), 16) % 10000;
  return `${label} #${num.toString().padStart(4, "0")}`;
}

/** -1 = visitante, 0 = empate, 1 = local */
export function matchOutcome(scoreA: number, scoreB: number): -1 | 0 | 1 {
  if (scoreA > scoreB) return 1;
  if (scoreA < scoreB) return -1;
  return 0;
}

/**
 * Puntos por partido de fútbol:
 * 3 = marcador exacto · 2 = ganador/empate + misma diferencia de goles · 1 = solo ganador/empate · 0 = fallo
 */
export function scoreFootballMatchPoints(
  scoreA: number,
  scoreB: number,
  resultA: number | null,
  resultB: number | null
): 0 | 1 | 2 | 3 {
  if (resultA == null || resultB == null) return 0;
  if (scoreA === resultA && scoreB === resultB) return 3;

  if (matchOutcome(scoreA, scoreB) !== matchOutcome(resultA, resultB)) return 0;

  const predDiff = Math.abs(scoreA - scoreB);
  const resultDiff = Math.abs(resultA - resultB);
  if (predDiff === resultDiff) return 2;

  return 1;
}

export function isExactHit(
  scoreA: number,
  scoreB: number,
  resultA: number | null,
  resultB: number | null
): boolean {
  return scoreFootballMatchPoints(scoreA, scoreB, resultA, resultB) === 3;
}

export type DashboardUserRow = { id: string; fullName: string | null; email: string };

export type LeaderboardRowOut = {
  userId: string;
  alias: string;
  /** Puntos acumulados (campo histórico `hits` en la API). */
  hits: number;
  rank: number;
  rankChange: number;
};

/**
 * Ranking por conjunto de usuarios (empresa o liga) sumando puntos por partido.
 */
export function computeLeaderboardForUsers(
  matchesWithResult: Array<{
    id: string;
    kickoffAt: Date;
    resultScoreA: number | null;
    resultScoreB: number | null;
  }>,
  predictions: Array<{
    userId: string;
    matchId: string;
    scoreA: number;
    scoreB: number;
    match: { resultScoreA: number | null; resultScoreB: number | null };
  }>,
  companyUsers: DashboardUserRow[],
  anonymize: boolean,
  companyIdForAnonymization: string,
  currentUserId: string,
  anonymizeLabel: AnonymizeLabel = "Empleado"
): {
  leaderboard: LeaderboardRowOut[];
  myRank: number | null;
  totalParticipants: number;
  rankChange: number;
} {
  const companyUserIds = companyUsers.map((u) => u.id);
  const userById = new Map(companyUsers.map((u) => [u.id, u]));

  const pointsByUserByMatchIdx = new Map<string, number[]>();
  for (const uid of companyUserIds) {
    pointsByUserByMatchIdx.set(uid, []);
  }

  for (let i = 0; i < matchesWithResult.length; i++) {
    const m = matchesWithResult[i];
    for (const uid of companyUserIds) {
      const pred = predictions.find((p) => p.userId === uid && p.matchId === m.id);
      const prevPoints = i === 0 ? 0 : (pointsByUserByMatchIdx.get(uid) ?? [])[i - 1] ?? 0;
      const pts =
        pred != null
          ? scoreFootballMatchPoints(pred.scoreA, pred.scoreB, m.resultScoreA, m.resultScoreB)
          : 0;
      const cum = prevPoints + pts;
      pointsByUserByMatchIdx.get(uid)!.push(cum);
    }
  }

  const pointsByUser = new Map<string, number>();
  for (const uid of companyUserIds) {
    const arr = pointsByUserByMatchIdx.get(uid) ?? [];
    pointsByUser.set(uid, arr[arr.length - 1] ?? 0);
  }

  const leaderboard = companyUserIds
    .map((uid) => {
      const u = userById.get(uid);
      const displayName = anonymize
        ? anonymizeUserId(uid, companyIdForAnonymization, anonymizeLabel)
        : u?.fullName?.trim() || u?.email || "Usuario";
      return {
        userId: uid,
        alias: displayName,
        hits: pointsByUser.get(uid) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.hits - a.hits ||
        a.alias.localeCompare(b.alias, "es", { sensitivity: "base" })
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const prevPointsByUser = new Map<string, number>();
  for (const uid of companyUserIds) {
    const arr = pointsByUserByMatchIdx.get(uid) ?? [];
    prevPointsByUser.set(uid, arr.length > 1 ? arr[arr.length - 2]! : 0);
  }
  const prevLeaderboard = companyUserIds
    .map((uid) => ({ userId: uid, hits: prevPointsByUser.get(uid) ?? 0 }))
    .sort((a, b) => b.hits - a.hits)
    .map((r, i) => ({ ...r, prevRank: i + 1 }));

  const prevRankByUser = new Map(prevLeaderboard.map((r) => [r.userId, r.prevRank]));
  const leaderboardWithChange = leaderboard.map((e) => {
    const prevRank = prevRankByUser.get(e.userId);
    const rankChange = prevRank != null ? prevRank - e.rank : 0;
    return { ...e, rankChange };
  });

  const myEntry = leaderboardWithChange.find((r) => r.userId === currentUserId);
  const myRank = myEntry ? myEntry.rank : null;
  const myRankChange = leaderboardWithChange.find((r) => r.userId === currentUserId)?.rankChange ?? 0;

  return {
    leaderboard: leaderboardWithChange,
    myRank,
    totalParticipants: companyUserIds.length,
    rankChange: myRankChange,
  };
}

/** Lista de miembros con 0 puntos, orden alfabético por nombre visible (sin resultados aún). */
export function buildAlphabeticalMemberLeaderboard(
  companyUsers: DashboardUserRow[],
  anonymize: boolean,
  companyIdForAnonymization: string,
  currentUserId: string,
  anonymizeLabel: AnonymizeLabel = "Empleado"
): {
  leaderboard: LeaderboardRowOut[];
  myRank: number | null;
  totalParticipants: number;
  rankChange: number;
} {
  const rows = companyUsers
    .map((u) => {
      const alias = anonymize
        ? anonymizeUserId(u.id, companyIdForAnonymization, anonymizeLabel)
        : u.fullName?.trim() || u.email || "Usuario";
      return { userId: u.id, alias, hits: 0 };
    })
    .sort((a, b) => a.alias.localeCompare(b.alias, "es", { sensitivity: "base" }));

  const leaderboard = rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    rankChange: 0,
  }));

  const myEntry = leaderboard.find((r) => r.userId === currentUserId);
  return {
    leaderboard,
    myRank: myEntry?.rank ?? null,
    totalParticipants: companyUsers.length,
    rankChange: 0,
  };
}
