import type { PrismaClient } from "@prisma/client";
import { computeLeaderboardForUsers } from "./leaderboard";
import { isPlatformCompanySlug } from "./org-seat";

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
