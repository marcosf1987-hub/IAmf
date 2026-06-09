import crypto from "crypto";

export function anonymizeUserId(userId: string, companyId: string): string {
  const hash = crypto.createHash("sha256").update(`${userId}-${companyId}`).digest("hex");
  const num = parseInt(hash.slice(0, 8), 16) % 10000;
  return `Empleado #${num.toString().padStart(4, "0")}`;
}

export function isExactHit(
  scoreA: number,
  scoreB: number,
  resultA: number | null,
  resultB: number | null
): boolean {
  if (resultA == null || resultB == null) return false;
  return scoreA === resultA && scoreB === resultB;
}

export type DashboardUserRow = { id: string; fullName: string | null; email: string };

export type LeaderboardRowOut = {
  userId: string;
  alias: string;
  hits: number;
  rank: number;
  rankChange: number;
};

/**
 * Ranking por conjunto de usuarios (empresa o liga) con la misma lógica de aciertos que el dashboard global.
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
  currentUserId: string
): {
  leaderboard: LeaderboardRowOut[];
  myRank: number | null;
  totalParticipants: number;
  rankChange: number;
} {
  const companyUserIds = companyUsers.map((u) => u.id);
  const userById = new Map(companyUsers.map((u) => [u.id, u]));

  const hitsByUserByMatchIdx = new Map<string, number[]>();
  for (const uid of companyUserIds) {
    hitsByUserByMatchIdx.set(uid, []);
  }

  for (let i = 0; i < matchesWithResult.length; i++) {
    const m = matchesWithResult[i];
    for (const uid of companyUserIds) {
      const pred = predictions.find((p) => p.userId === uid && p.matchId === m.id);
      const prevHits = i === 0 ? 0 : (hitsByUserByMatchIdx.get(uid) ?? [])[i - 1] ?? 0;
      const isHit =
        pred &&
        isExactHit(pred.scoreA, pred.scoreB, m.resultScoreA, m.resultScoreB);
      const cum = prevHits + (isHit ? 1 : 0);
      hitsByUserByMatchIdx.get(uid)!.push(cum);
    }
  }

  const hitsByUser = new Map<string, number>();
  for (const uid of companyUserIds) {
    const arr = hitsByUserByMatchIdx.get(uid) ?? [];
    hitsByUser.set(uid, arr[arr.length - 1] ?? 0);
  }

  const leaderboard = companyUserIds
    .map((uid) => {
      const u = userById.get(uid);
      const displayName = anonymize
        ? anonymizeUserId(uid, companyIdForAnonymization)
        : u?.fullName?.trim() || u?.email || "Usuario";
      return {
        userId: uid,
        alias: displayName,
        hits: hitsByUser.get(uid) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.hits - a.hits ||
        a.alias.localeCompare(b.alias, "es", { sensitivity: "base" })
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const prevHitsByUser = new Map<string, number>();
  for (const uid of companyUserIds) {
    const arr = hitsByUserByMatchIdx.get(uid) ?? [];
    prevHitsByUser.set(uid, arr.length > 1 ? arr[arr.length - 2]! : 0);
  }
  const prevLeaderboard = companyUserIds
    .map((uid) => ({ userId: uid, hits: prevHitsByUser.get(uid) ?? 0 }))
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
  currentUserId: string
): {
  leaderboard: LeaderboardRowOut[];
  myRank: number | null;
  totalParticipants: number;
  rankChange: number;
} {
  const rows = companyUsers
    .map((u) => {
      const alias = anonymize
        ? anonymizeUserId(u.id, companyIdForAnonymization)
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
