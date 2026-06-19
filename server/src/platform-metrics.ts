import type { Prisma, PrismaClient } from "@prisma/client";
import { UNIVERSAL_COMPETITION_SLUG } from "./universal-league";

export type PlatformOverviewPayload = {
  platformCompany: { id: string; name: string } | null;
  publicPool: {
    activeUsers: number;
    universalLeagueActiveMembers: number;
    universalLeagueTotalMembers: number;
  };
  platformWide: {
    activeUsers: number;
    b2bActiveUsers: number;
    disabledUsers: number;
    competitionInvitesPending: number;
    competitionInvitesAccepted: number;
    publicPoolCompetitionInvitesPending: number;
    publicPoolCompetitionInvitesAccepted: number;
  };
  engagement: {
    usersWithFootballPredictions: number;
    usersWithF1Predictions: number;
    usersWithGuidelines: number;
    matchesWithResult: number;
    matchesTotal: number;
  };
};

export type PlatformUserMetrics = {
  sessionCount: number;
  prodePrompts: number;
  totalPrompts: number;
  footballPredictions: number;
  f1Predictions: number;
  hasGuidelines: boolean;
  lastActivityAt: string | null;
};

type GuidelinesRow = {
  userId: string;
  textGroups: string;
  textRoundOf32: string;
  textKnockout: string;
  f1RaceGuidelines: Prisma.JsonValue;
};

function countMap(groups: { userId: string; _count: { _all: number } }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of groups) {
    map.set(row.userId, row._count._all);
  }
  return map;
}

function maxDateMap(groups: { userId: string; _max: { createdAt: Date | null } }[]): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const row of groups) {
    if (row._max.createdAt) map.set(row.userId, row._max.createdAt);
  }
  return map;
}

function maxUpdatedMap(groups: { userId: string; _max: { updatedAt: Date | null } }[]): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const row of groups) {
    if (row._max.updatedAt) map.set(row.userId, row._max.updatedAt);
  }
  return map;
}

export function guidelinesRowHasContent(row: GuidelinesRow): boolean {
  if (row.textGroups.trim() || row.textRoundOf32.trim() || row.textKnockout.trim()) {
    return true;
  }
  const f1 = row.f1RaceGuidelines;
  if (f1 && typeof f1 === "object" && !Array.isArray(f1)) {
    return Object.values(f1 as Record<string, unknown>).some(
      (v) => typeof v === "string" && v.trim().length > 0
    );
  }
  return false;
}

function latestActivity(...dates: (Date | undefined)[]): Date | null {
  let maxMs = 0;
  let found = false;
  for (const d of dates) {
    if (!d) continue;
    found = true;
    maxMs = Math.max(maxMs, d.getTime());
  }
  return found ? new Date(maxMs) : null;
}

const nonSuperAdminWhere = { role: { not: "super_admin" as const } };

export async function buildPlatformOverview(prisma: PrismaClient): Promise<PlatformOverviewPayload> {
  const empty: PlatformOverviewPayload = {
    platformCompany: null,
    publicPool: {
      activeUsers: 0,
      universalLeagueActiveMembers: 0,
      universalLeagueTotalMembers: 0,
    },
    platformWide: {
      activeUsers: 0,
      b2bActiveUsers: 0,
      disabledUsers: 0,
      competitionInvitesPending: 0,
      competitionInvitesAccepted: 0,
      publicPoolCompetitionInvitesPending: 0,
      publicPoolCompetitionInvitesAccepted: 0,
    },
    engagement: {
      usersWithFootballPredictions: 0,
      usersWithF1Predictions: 0,
      usersWithGuidelines: 0,
      matchesWithResult: 0,
      matchesTotal: 0,
    },
  };

  const platform = await prisma.company.findUnique({
    where: { slug: "platform-internal" },
    select: { id: true, name: true },
  });
  if (!platform) return empty;

  const now = new Date();
  const universal = await prisma.competition.findFirst({
    where: { companyId: platform.id, slug: UNIVERSAL_COMPETITION_SLUG },
    select: { id: true },
  });

  const [
    publicPoolActiveUsers,
    universalLeagueTotalMembers,
    universalLeagueActiveMembers,
    platformActiveUsers,
    platformDisabledUsers,
    b2bActiveUsers,
    competitionInvitesPending,
    competitionInvitesAccepted,
    publicPoolCompetitionInvitesPending,
    publicPoolCompetitionInvitesAccepted,
    usersWithFootballPredictions,
    usersWithF1Predictions,
    guidelinesRows,
    matchesTotal,
    matchesWithResult,
  ] = await Promise.all([
    prisma.user.count({
      where: { companyId: platform.id, status: "active", ...nonSuperAdminWhere },
    }),
    universal
      ? prisma.competitionMember.count({ where: { competitionId: universal.id } })
      : Promise.resolve(0),
    universal
      ? prisma.competitionMember.count({
          where: {
            competitionId: universal.id,
            user: { status: "active", ...nonSuperAdminWhere },
          },
        })
      : Promise.resolve(0),
    prisma.user.count({ where: { status: "active", ...nonSuperAdminWhere } }),
    prisma.user.count({ where: { status: "disabled", ...nonSuperAdminWhere } }),
    prisma.user.count({
      where: { status: "active", companyId: { not: platform.id }, ...nonSuperAdminWhere },
    }),
    prisma.competitionInvitation.count({
      where: { acceptedAt: null, expiresAt: { gt: now } },
    }),
    prisma.competitionInvitation.count({
      where: { acceptedAt: { not: null } },
    }),
    prisma.competitionInvitation.count({
      where: {
        acceptedAt: null,
        expiresAt: { gt: now },
        competition: { companyId: platform.id },
      },
    }),
    prisma.competitionInvitation.count({
      where: {
        acceptedAt: { not: null },
        competition: { companyId: platform.id },
      },
    }),
    prisma.user.count({
      where: { ...nonSuperAdminWhere, predictions: { some: {} } },
    }),
    prisma.user.count({
      where: { ...nonSuperAdminWhere, f1Predictions: { some: {} } },
    }),
    prisma.prodeGuidelines.findMany({
      select: {
        userId: true,
        textGroups: true,
        textRoundOf32: true,
        textKnockout: true,
        f1RaceGuidelines: true,
      },
    }),
    prisma.match.count(),
    prisma.match.count({
      where: { resultScoreA: { not: null }, resultScoreB: { not: null } },
    }),
  ]);

  const usersWithGuidelines = guidelinesRows.filter(guidelinesRowHasContent).length;

  return {
    platformCompany: { id: platform.id, name: platform.name },
    publicPool: {
      activeUsers: publicPoolActiveUsers,
      universalLeagueActiveMembers: universalLeagueActiveMembers,
      universalLeagueTotalMembers: universalLeagueTotalMembers,
    },
    platformWide: {
      activeUsers: platformActiveUsers,
      b2bActiveUsers: b2bActiveUsers,
      disabledUsers: platformDisabledUsers,
      competitionInvitesPending,
      competitionInvitesAccepted,
      publicPoolCompetitionInvitesPending,
      publicPoolCompetitionInvitesAccepted,
    },
    engagement: {
      usersWithFootballPredictions,
      usersWithF1Predictions,
      usersWithGuidelines,
      matchesWithResult,
      matchesTotal,
    },
  };
}

import type { AdminDateRange } from "./admin-date-range";

function createdAtInRange(range?: AdminDateRange) {
  return range ? { createdAt: { gte: range.from, lte: range.to } } : {};
}

export async function loadPlatformUserMetrics(
  prisma: PrismaClient,
  userIds: string[],
  range?: AdminDateRange
): Promise<Map<string, PlatformUserMetrics>> {
  const result = new Map<string, PlatformUserMetrics>();
  if (userIds.length === 0) return result;

  const dateWhere = createdAtInRange(range);

  const [
    loginCounts,
    promptCounts,
    prodePromptCounts,
    footballCounts,
    f1Counts,
    guidelinesRows,
    lastLogins,
    lastPrompts,
    lastPredictions,
    lastF1,
    lastHistory,
  ] = await Promise.all([
    prisma.loginEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, ...dateWhere },
      _count: { _all: true },
    }),
    prisma.promptLog.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, ...dateWhere },
      _count: { _all: true },
    }),
    prisma.promptLog.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, batchId: { not: null }, ...dateWhere },
      _count: { _all: true },
    }),
    prisma.prediction.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, ...dateWhere },
      _count: { _all: true },
    }),
    prisma.f1Prediction.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, ...dateWhere },
      _count: { _all: true },
    }),
    prisma.prodeGuidelines.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        textGroups: true,
        textRoundOf32: true,
        textKnockout: true,
        f1RaceGuidelines: true,
      },
    }),
    prisma.loginEvent.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _max: { createdAt: true },
    }),
    prisma.promptLog.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _max: { createdAt: true },
    }),
    prisma.prediction.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _max: { createdAt: true },
    }),
    prisma.f1Prediction.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _max: { updatedAt: true },
    }),
    prisma.predictionHistory.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _max: { createdAt: true },
    }),
  ]);

  const loginsByUser = countMap(loginCounts);
  const promptsByUser = countMap(promptCounts);
  const prodePromptsByUser = countMap(prodePromptCounts);
  const footballByUser = countMap(footballCounts);
  const f1ByUser = countMap(f1Counts);
  const guidelinesByUser = new Map(
    guidelinesRows.map((g) => [g.userId, guidelinesRowHasContent(g)])
  );
  const lastLoginByUser = maxDateMap(lastLogins);
  const lastPromptByUser = maxDateMap(lastPrompts);
  const lastPredictionByUser = maxDateMap(lastPredictions);
  const lastF1ByUser = maxUpdatedMap(lastF1);
  const lastHistoryByUser = maxDateMap(lastHistory);

  for (const userId of userIds) {
    const activity = latestActivity(
      lastLoginByUser.get(userId),
      lastPromptByUser.get(userId),
      lastPredictionByUser.get(userId),
      lastF1ByUser.get(userId),
      lastHistoryByUser.get(userId)
    );
    result.set(userId, {
      sessionCount: loginsByUser.get(userId) ?? 0,
      prodePrompts: prodePromptsByUser.get(userId) ?? 0,
      totalPrompts: promptsByUser.get(userId) ?? 0,
      footballPredictions: footballByUser.get(userId) ?? 0,
      f1Predictions: f1ByUser.get(userId) ?? 0,
      hasGuidelines: guidelinesByUser.get(userId) ?? false,
      lastActivityAt: activity ? activity.toISOString() : null,
    });
  }

  return result;
}
