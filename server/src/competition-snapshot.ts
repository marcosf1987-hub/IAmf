import type { PrismaClient } from "@prisma/client";
import { anonymizeUserId, computeLeaderboardForUsers } from "./leaderboard";
import { isPlatformCompanySlug } from "./org-seat";
import { aggregateF1PointsByUser, officialTop10DriverNumbers } from "./f1-scoring";

/**
 * Datos de ranking para tarjetas de liga (tu puesto, total, top 3).
 */
export async function getCompetitionCardSnapshot(
  prisma: PrismaClient,
  competitionId: string,
  viewerUserId: string
): Promise<{
  myRank: number | null;
  totalParticipants: number;
  topThree: Array<{ userId: string; displayLabel: string; rank: number }>;
}> {
  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      company: { select: { id: true, slug: true } },
    },
  });
  if (!comp) {
    return { myRank: null, totalParticipants: 0, topThree: [] };
  }

  const members = await prisma.competitionMember.findMany({
    where: { competitionId },
    select: { userId: true },
  });
  const memberIds = members.map((m) => m.userId);
  if (memberIds.length === 0) {
    return { myRank: null, totalParticipants: 0, topThree: [] };
  }

  const memberUsers = await prisma.user.findMany({
    where: { id: { in: memberIds }, status: "active" },
    select: { id: true, fullName: true, email: true },
  });

  const compConfig = await prisma.companyConfig.findUnique({
    where: { companyId: comp.companyId },
    select: { anonymizationEnabled: true },
  });
  const anonymizeCompetition =
    !isPlatformCompanySlug(comp.company.slug) && (compConfig?.anonymizationEnabled ?? true);

  if (comp.discipline === "f1") {
    const racesAll = await prisma.f1Race.findMany({
      select: { id: true, resultTop10: true },
    });
    const races = racesAll.filter((r) => officialTop10DriverNumbers(r.resultTop10).length === 10);
    const preds = await prisma.f1Prediction.findMany({
      where: { userId: { in: memberIds } },
      select: { userId: true, raceId: true, placements: true },
    });
    const totals = aggregateF1PointsByUser(races, preds);
    const sorted = [...memberIds]
      .map((uid) => ({ userId: uid, points: totals.get(uid) ?? 0 }))
      .sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
    const withRank = sorted.map((row, i) => ({ ...row, rank: i + 1 }));
    const myRow = withRank.find((r) => r.userId === viewerUserId);
    const topThree = withRank.slice(0, 3).map((r) => {
      const u = memberUsers.find((x) => x.id === r.userId);
      const label =
        anonymizeCompetition && u
          ? anonymizeUserId(u.id, comp.companyId)
          : (u?.fullName || u?.email || `Usuario #${r.userId.slice(0, 4)}`);
      return { userId: r.userId, displayLabel: label, rank: r.rank };
    });
    return {
      myRank: myRow?.rank ?? null,
      totalParticipants: memberIds.length,
      topThree,
    };
  }

  const matchesWithResult = await prisma.match.findMany({
    where: {
      resultScoreA: { not: null },
      resultScoreB: { not: null },
    },
    select: { id: true, kickoffAt: true, resultScoreA: true, resultScoreB: true },
    orderBy: { kickoffAt: "asc" },
  });
  const matchIds = matchesWithResult.map((m) => m.id);
  if (matchIds.length === 0) {
    return {
      myRank: null,
      totalParticipants: memberIds.length,
      topThree: [],
    };
  }

  const predComp = await prisma.prediction.findMany({
    where: {
      userId: { in: memberIds },
      matchId: { in: matchIds },
    },
    include: {
      match: { select: { resultScoreA: true, resultScoreB: true } },
    },
  });

  const lb = computeLeaderboardForUsers(
    matchesWithResult,
    predComp.map((p) => ({
      userId: p.userId,
      matchId: p.matchId,
      scoreA: p.scoreA,
      scoreB: p.scoreB,
      match: {
        resultScoreA: p.match.resultScoreA,
        resultScoreB: p.match.resultScoreB,
      },
    })),
    memberUsers,
    anonymizeCompetition,
    comp.companyId,
    viewerUserId
  );

  const topThree = lb.leaderboard.slice(0, 3).map((r) => ({
    userId: r.userId,
    displayLabel: r.alias,
    rank: r.rank,
  }));

  return {
    myRank: lb.myRank,
    totalParticipants: lb.totalParticipants,
    topThree,
  };
}
