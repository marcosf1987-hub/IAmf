import type { PrismaClient } from "@prisma/client";
import type { CompetitionDiscipline } from "./discipline-query";
import {
  buildAlphabeticalMemberLeaderboard,
  computeLeaderboardForUsers,
  scoreFootballMatchPoints,
} from "./leaderboard";
import {
  buildF1LeagueLeaderboardRows,
  f1TotalsForMembers,
  loadF1RacesForScoring,
} from "./f1-competition-leaderboard";
import { competitionRankingDisplay, isPlatformCompanySlug } from "./org-seat";
import { rankingVisibleUserWhere } from "./ranking-users";

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
  /** false en pool B2C (platform-internal): solo rankings por liga. */
  showGlobalRanking: boolean;
};

type MembershipRow = Awaited<ReturnType<typeof prismaMembershipQuery>>[number];

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

function emptyDashboard(
  competitionLeaderboards: CompetitionLeaderboardBlock[],
  isPublicPool: boolean
): ResultsDashboardPayload {
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
    showGlobalRanking: !isPublicPool,
  };
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
      where: rankingVisibleUserWhere({ id: { in: memberIds } }),
      select: { id: true, fullName: true, email: true },
    });
    const visibleMemberIds = memberUsers.map((u) => u.id);
    if (visibleMemberIds.length === 0) continue;

    const compConfig = await prisma.companyConfig.findUnique({
      where: { companyId: comp.companyId },
      select: { anonymizationEnabled: true },
    });

    const { anonymize: anonymizeCompetition, label: anonymizeLabel } = competitionRankingDisplay(
      comp.company.slug,
      compConfig?.anonymizationEnabled
    );

    if (comp.discipline === "f1") {
      const totals = await f1TotalsForMembers(prisma, visibleMemberIds, f1RacesOfficial);
      const lb = buildF1LeagueLeaderboardRows(
        visibleMemberIds,
        totals,
        memberUsers,
        anonymizeCompetition,
        comp.companyId,
        userId,
        anonymizeLabel
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
        userId,
        anonymizeLabel
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
        userId: { in: visibleMemberIds },
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
      userId,
      anonymizeLabel
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
  memberships: MembershipRow[],
  isPublicPool: boolean
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

  if (isPublicPool) {
    const totals = await f1TotalsForMembers(prisma, [userId], f1RacesOfficial);
    const totalHits = totals.get(userId) ?? 0;
    const raceCount = f1RacesOfficial.length;
    const precision =
      raceCount > 0 ? Math.min(100, Math.round((totalHits / (raceCount * 10)) * 100)) : 0;
    return {
      totalHits,
      totalWithResult: raceCount,
      precision,
      leaderboard: [],
      myRank: null,
      totalParticipants: 0,
      rankChange: 0,
      pointsOverTime: [],
      competitionLeaderboards,
      showGlobalRanking: false,
    };
  }

  const [companyUsers, companyConfig] = await Promise.all([
    prisma.user.findMany({
      where: rankingVisibleUserWhere({ companyId }),
      select: { id: true, fullName: true, email: true },
    }),
    prisma.companyConfig.findUnique({
      where: { companyId },
      select: { anonymizationEnabled: true },
    }),
  ]);

  const companyUserIds = companyUsers.map((u) => u.id);
  const { anonymize: anonymizedGlobal, label: globalLabel } = competitionRankingDisplay(
    (await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } }))
      ?.slug ?? "",
    companyConfig?.anonymizationEnabled
  );
  const totals = await f1TotalsForMembers(prisma, companyUserIds, f1RacesOfficial);
  const globalLb = buildF1LeagueLeaderboardRows(
    companyUserIds,
    totals,
    companyUsers,
    anonymizedGlobal,
    companyId,
    userId,
    globalLabel
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
    showGlobalRanking: true,
  };
}

async function buildFootballResultsDashboardPayload(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
  memberships: MembershipRow[],
  isPublicPool: boolean
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
    return emptyDashboard(competitionLeaderboards, isPublicPool);
  }

  const matchIds = matchesWithResult.map((m) => m.id);

  const myPredictions = await prisma.prediction.findMany({
    where: { userId, matchId: { in: matchIds } },
    include: {
      match: { select: { resultScoreA: true, resultScoreB: true, kickoffAt: true } },
    },
  });

  let cum = 0;
  const pointsOverTime = matchesWithResult.map((m) => {
    const pred = myPredictions.find((p) => p.matchId === m.id);
    const pts =
      pred != null
        ? scoreFootballMatchPoints(
            pred.scoreA,
            pred.scoreB,
            pred.match.resultScoreA,
            pred.match.resultScoreB
          )
        : 0;
    cum += pts;
    return {
      date: m.kickoffAt.toISOString().slice(0, 10),
      points: cum,
    };
  });

  const totalHits = cum;
  const totalWithResult = matchesWithResult.length;
  const maxPossiblePoints = totalWithResult * 3;
  const precision =
    maxPossiblePoints > 0 ? Math.round((totalHits / maxPossiblePoints) * 100) : 0;

  const competitionLeaderboards = await buildCompetitionLeaderboardsForMemberships(
    prisma,
    memberships,
    userId,
    matchIds,
    matchesWithResult,
    []
  );

  if (isPublicPool) {
    return {
      totalHits,
      totalWithResult,
      precision,
      leaderboard: [],
      myRank: null,
      totalParticipants: 0,
      rankChange: 0,
      pointsOverTime,
      competitionLeaderboards,
      showGlobalRanking: false,
    };
  }

  const [companyUsers, companyConfig] = await Promise.all([
    prisma.user.findMany({
      where: rankingVisibleUserWhere({ companyId }),
      select: { id: true, fullName: true, email: true },
    }),
    prisma.companyConfig.findUnique({
      where: { companyId },
      select: { anonymizationEnabled: true },
    }),
  ]);

  const companySlug =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { slug: true } }))?.slug ??
    "";
  const { anonymize: anonymizedGlobal, label: globalLabel } = competitionRankingDisplay(
    companySlug,
    companyConfig?.anonymizationEnabled
  );

  const predictions = await prisma.prediction.findMany({
    where: {
      userId: { in: companyUsers.map((u) => u.id) },
      matchId: { in: matchIds },
    },
    include: {
      match: { select: { resultScoreA: true, resultScoreB: true } },
    },
  });

  const globalLb = computeLeaderboardForUsers(
    matchesWithResult,
    predictions.map((p) => ({
      userId: p.userId,
      matchId: p.matchId,
      scoreA: p.scoreA,
      scoreB: p.scoreB,
      match: {
        resultScoreA: p.match.resultScoreA,
        resultScoreB: p.match.resultScoreB,
      },
    })),
    companyUsers,
    anonymizedGlobal,
    companyId,
    userId,
    globalLabel
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
    showGlobalRanking: true,
  };
}

export async function buildResultsDashboardPayload(
  prisma: PrismaClient,
  userId: string,
  companyId: string,
  discipline?: CompetitionDiscipline
): Promise<ResultsDashboardPayload> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { slug: true },
  });
  const isPublicPool = isPlatformCompanySlug(company?.slug ?? "");

  const allMemberships = await prismaMembershipQuery(prisma, userId);
  const memberships = filterMembershipsByDiscipline(allMemberships, discipline);

  if (discipline === "f1") {
    return buildF1ResultsDashboardPayload(prisma, userId, companyId, memberships, isPublicPool);
  }

  return buildFootballResultsDashboardPayload(
    prisma,
    userId,
    companyId,
    memberships,
    isPublicPool
  );
}
