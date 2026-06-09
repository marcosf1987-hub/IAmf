import type { PrismaClient } from "@prisma/client";
import type { CompetitionDiscipline } from "./discipline-query";
import {
  buildAlphabeticalMemberLeaderboard,
  computeLeaderboardForUsers,
  isExactHit,
} from "./leaderboard";
import { isPlatformCompanySlug } from "./org-seat";
import {
  buildF1LeagueLeaderboardRows,
  f1TotalsForMembers,
  loadF1RacesForScoring,
} from "./f1-competition-leaderboard";

export type CompetitionLeaderboardBlock = {
  id: string;
  name: string;
  slug: string;
  leaderboard: Array<{
    userId: string;
    alias: string;
    hits: number;
    rank: number;
    rankChange: number;
  }>;
  myRank: number | null;
  totalParticipants: number;
  rankChange: number;
};

export type ResultsDashboardPayload = {
  totalHits: number;
  totalWithResult: number;
  precision: number;
  leaderboard: CompetitionLeaderboardBlock["leaderboard"];
  myRank: number | null;
  totalParticipants: number;
  rankChange: number;
  pointsOverTime: { date: string; points: number }[];
  competitionLeaderboards: CompetitionLeaderboardBlock[];
};

type MembershipRow = Awaited<
  ReturnType<
    typeof prismaMembershipQuery
  >
>[number];

async function prismaMembershipQuery(prisma: PrismaClient, userId: string) {
  return prisma.competitionMember.findMany({
    where: { userId },
    include: {
      competition: {
        include: {
          company: { select: { id: true, slug: true } },
        },
      },
    },
  });
}

function filterMembershipsByDiscipline(
  memberships: MembershipRow[],
  discipline?: CompetitionDiscipline
): MembershipRow[] {
  if (!discipline) return memberships;
  return memberships.filter((m) => m.competition.discipline === discipline);
}

async function buildCompetitionLeaderboardsForMemberships(
  prisma: PrismaClient,
  memberships: MembershipRow[],
  userId: string,
  matchIds: string[],
  footballMatches: Array<{
    id: string;
    kickoffAt: Date;
    resultScoreA: number | null;
    resultScoreB: number | null;
  }>,
  f1RacesOfficial: Awaited<ReturnType<typeof loadF1RacesForScoring>>
): Promise<CompetitionLeaderboardBlock[]> {
  const competitionLeaderboards: CompetitionLeaderboardBlock[] = [];

  for (const mem of memberships) {
    const comp = mem.competition;
    const members = await prisma.competitionMember.findMany({
      where: { competitionId: comp.id },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    if (memberIds.length === 0) continue;

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
      const totals = await f1TotalsForMembers(prisma, memberIds, f1RacesOfficial);
      const lb = buildF1LeagueLeaderboardRows(
        memberIds,
        totals,
        memberUsers,
        anonymizeCompetition,
        comp.companyId,
        userId
      );
      competitionLeaderboards.push({
        id: comp.id,
        name: comp.name,
        slug: comp.slug,
        leaderboard: lb.leaderboard,
        myRank: lb.myRank,
        totalParticipants: lb.totalParticipants,
        rankChange: 0,
      });
      continue;
    }

    if (matchIds.length === 0) {
      const lb = buildAlphabeticalMemberLeaderboard(
        memberUsers,
        anonymizeCompetition,
        comp.companyId,
        userId
      );
      competitionLeaderboards.push({
        id: comp.id,
        name: comp.name,
        slug: comp.slug,
        leaderboard: lb.leaderboard,
        myRank: lb.myRank,
        totalParticipants: lb.totalParticipants,
        rankChange: lb.rankChange,
      });
      continue;
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
      footballMatches,
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
      userId
    );

    competitionLeaderboards.push({
      id: comp.id,
      name: comp.name,
      slug: comp.slug,
      leaderboard: lb.leaderboard,
      myRank: lb.myRank,
      totalParticipants: lb.totalParticipants,
      rankChange: lb.rankChange,
    });
  }

  return competitionLeaderboards;
}

async function buildF1ResultsDashboardPayload(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
  memberships: MembershipRow[]
): Promise<ResultsDashboardPayload> {
  const f1RacesOfficial = await loadF1RacesForScoring(prisma);
  const competitionLeaderboards = await buildCompetitionLeaderboardsForMemberships(
    prisma,
    memberships,
    userId,
    [],
    [],
    f1RacesOfficial
  );

  const [companyUsers, companyConfig] = await Promise.all([
    prisma.user.findMany({
      where: { companyId, status: "active" },
      select: { id: true, fullName: true, email: true },
    }),
    prisma.companyConfig.findUnique({
      where: { companyId },
      select: { anonymizationEnabled: true },
    }),
  ]);

  const companyUserIds = companyUsers.map((u) => u.id);
  const anonymizedGlobal = companyConfig?.anonymizationEnabled ?? true;
  const totals = await f1TotalsForMembers(prisma, companyUserIds, f1RacesOfficial);
  const globalLb = buildF1LeagueLeaderboardRows(
    companyUserIds,
    totals,
    companyUsers,
    anonymizedGlobal,
    companyId,
    userId
  );

  const myEntry = globalLb.leaderboard.find((r) => r.userId === userId);
  const totalHits = myEntry?.hits ?? 0;
  const raceCount = f1RacesOfficial.length;
  const precision =
    raceCount > 0 ? Math.min(100, Math.round((totalHits / (raceCount * 10)) * 100)) : 0;

  return {
    totalHits,
    totalWithResult: raceCount,
    precision,
    leaderboard: globalLb.leaderboard,
    myRank: globalLb.myRank,
    totalParticipants: globalLb.totalParticipants,
    rankChange: 0,
    pointsOverTime: [],
    competitionLeaderboards,
  };
}

async function buildFootballResultsDashboardPayload(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
  memberships: MembershipRow[]
): Promise<ResultsDashboardPayload> {
  const matchesWithResult = await prisma.match.findMany({
    where: {
      resultScoreA: { not: null },
      resultScoreB: { not: null },
    },
    select: { id: true, kickoffAt: true, resultScoreA: true, resultScoreB: true },
    orderBy: { kickoffAt: "asc" },
  });

  if (matchesWithResult.length === 0) {
    const competitionLeaderboards = await buildCompetitionLeaderboardsForMemberships(
      prisma,
      memberships,
      userId,
      [],
      [],
      []
    );
    return {
      totalHits: 0,
      totalWithResult: 0,
      precision: 0,
      leaderboard: [],
      myRank: null,
      totalParticipants: 0,
      rankChange: 0,
      pointsOverTime: [],
      competitionLeaderboards,
    };
  }

  const matchIds = matchesWithResult.map((m) => m.id);

  const [companyUsers, companyConfig] = await Promise.all([
    prisma.user.findMany({
      where: { companyId, status: "active" },
      select: { id: true, fullName: true, email: true },
    }),
    prisma.companyConfig.findUnique({
      where: { companyId },
      select: { anonymizationEnabled: true },
    }),
  ]);

  const companyUserIds = companyUsers.map((u) => u.id);
  const anonymizedGlobal = companyConfig?.anonymizationEnabled ?? true;

  const predictions = await prisma.prediction.findMany({
    where: {
      userId: { in: companyUserIds },
      matchId: { in: matchIds },
    },
    include: {
      match: { select: { resultScoreA: true, resultScoreB: true } },
    },
  });

  const predForLb = predictions.map((p) => ({
    userId: p.userId,
    matchId: p.matchId,
    scoreA: p.scoreA,
    scoreB: p.scoreB,
    match: {
      resultScoreA: p.match.resultScoreA,
      resultScoreB: p.match.resultScoreB,
    },
  }));

  const globalLb = computeLeaderboardForUsers(
    matchesWithResult,
    predForLb,
    companyUsers,
    anonymizedGlobal,
    companyId,
    userId
  );

  let cum = 0;
  const pointsOverTime = matchesWithResult.map((m) => {
    const pred = predictions.find((p) => p.userId === userId && p.matchId === m.id);
    const hit =
      pred &&
      pred.match.resultScoreA != null &&
      pred.match.resultScoreB != null &&
      isExactHit(pred.scoreA, pred.scoreB, pred.match.resultScoreA, pred.match.resultScoreB);
    cum += hit ? 1 : 0;
    return {
      date: m.kickoffAt.toISOString().slice(0, 10),
      points: cum,
    };
  });

  const myEntry = globalLb.leaderboard.find((r) => r.userId === userId);
  const totalHits = myEntry?.hits ?? 0;
  const totalWithResult = matchesWithResult.length;
  const precision =
    totalWithResult > 0 ? Math.round((totalHits / totalWithResult) * 100) : 0;

  const competitionLeaderboards = await buildCompetitionLeaderboardsForMemberships(
    prisma,
    memberships,
    userId,
    matchIds,
    matchesWithResult,
    []
  );

  return {
    totalHits,
    totalWithResult,
    precision,
    leaderboard: globalLb.leaderboard,
    myRank: globalLb.myRank,
    totalParticipants: globalLb.totalParticipants,
    rankChange: globalLb.rankChange,
    pointsOverTime,
    competitionLeaderboards,
  };
}

export async function buildResultsDashboardPayload(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
  discipline?: CompetitionDiscipline
): Promise<ResultsDashboardPayload> {
  const allMemberships = await prismaMembershipQuery(prisma, userId);
  const memberships = filterMembershipsByDiscipline(allMemberships, discipline);

  if (discipline === "f1") {
    return buildF1ResultsDashboardPayload(prisma, userId, companyId, memberships);
  }

  return buildFootballResultsDashboardPayload(prisma, userId, companyId, memberships);
}
