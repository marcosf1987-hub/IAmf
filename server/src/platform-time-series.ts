import type { PrismaClient } from "@prisma/client";
import type { AdminDateRange } from "./admin-date-range";

export type PlatformTimeSeriesScope = "pool" | "platform";

export type PlatformTimeSeriesPoint = {
  date: string;
  users: number;
  prompts: number;
  logins: number;
};

type DayRow = { d: Date; c: bigint };

function dayKey(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
}

export function mergePlatformTimeSeries(
  usersByDay: DayRow[],
  promptsByDay: DayRow[],
  loginsByDay: DayRow[]
): PlatformTimeSeriesPoint[] {
  const userMap = new Map<string, number>();
  for (const r of usersByDay) userMap.set(dayKey(r.d), Number(r.c));
  const promptMap = new Map<string, number>();
  for (const r of promptsByDay) promptMap.set(dayKey(r.d), Number(r.c));
  const loginMap = new Map<string, number>();
  for (const r of loginsByDay) loginMap.set(dayKey(r.d), Number(r.c));

  const allDates = new Set<string>([
    ...userMap.keys(),
    ...promptMap.keys(),
    ...loginMap.keys(),
  ]);
  const sortedDates = Array.from(allDates).sort();

  let cumUsers = 0;
  let cumPrompts = 0;
  let cumLogins = 0;
  const data: PlatformTimeSeriesPoint[] = [];

  for (const date of sortedDates) {
    cumUsers += userMap.get(date) ?? 0;
    cumPrompts += promptMap.get(date) ?? 0;
    cumLogins += loginMap.get(date) ?? 0;
    data.push({ date, users: cumUsers, prompts: cumPrompts, logins: cumLogins });
  }

  return data;
}

export async function buildPlatformTimeSeries(
  prisma: PrismaClient,
  platformCompanyId: string,
  range?: AdminDateRange,
  scope: PlatformTimeSeriesScope = "platform"
): Promise<PlatformTimeSeriesPoint[]> {
  const poolOnly = scope === "pool";

  const usersByDay = poolOnly
    ? range
      ? await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', u."createdAt")::date as d, count(*)::bigint as c
          FROM "User" u
          WHERE u."companyId" = ${platformCompanyId}
            AND u.role <> 'super_admin'
            AND u."createdAt" >= ${range.from}
            AND u."createdAt" <= ${range.to}
          GROUP BY date_trunc('day', u."createdAt")::date
          ORDER BY d
        `
      : await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', u."createdAt")::date as d, count(*)::bigint as c
          FROM "User" u
          WHERE u."companyId" = ${platformCompanyId}
            AND u.role <> 'super_admin'
          GROUP BY date_trunc('day', u."createdAt")::date
          ORDER BY d
        `
    : range
      ? await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', u."createdAt")::date as d, count(*)::bigint as c
          FROM "User" u
          WHERE u.role <> 'super_admin'
            AND u."createdAt" >= ${range.from}
            AND u."createdAt" <= ${range.to}
          GROUP BY date_trunc('day', u."createdAt")::date
          ORDER BY d
        `
      : await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', u."createdAt")::date as d, count(*)::bigint as c
          FROM "User" u
          WHERE u.role <> 'super_admin'
          GROUP BY date_trunc('day', u."createdAt")::date
          ORDER BY d
        `;

  const promptsByDay = poolOnly
    ? range
      ? await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', p."createdAt")::date as d, count(*)::bigint as c
          FROM "PromptLog" p
          JOIN "User" u ON p."userId" = u.id
          WHERE u."companyId" = ${platformCompanyId}
            AND u.role <> 'super_admin'
            AND p."createdAt" >= ${range.from}
            AND p."createdAt" <= ${range.to}
          GROUP BY date_trunc('day', p."createdAt")::date
          ORDER BY d
        `
      : await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', p."createdAt")::date as d, count(*)::bigint as c
          FROM "PromptLog" p
          JOIN "User" u ON p."userId" = u.id
          WHERE u."companyId" = ${platformCompanyId}
            AND u.role <> 'super_admin'
          GROUP BY date_trunc('day', p."createdAt")::date
          ORDER BY d
        `
    : range
      ? await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', p."createdAt")::date as d, count(*)::bigint as c
          FROM "PromptLog" p
          JOIN "User" u ON p."userId" = u.id
          WHERE u.role <> 'super_admin'
            AND p."createdAt" >= ${range.from}
            AND p."createdAt" <= ${range.to}
          GROUP BY date_trunc('day', p."createdAt")::date
          ORDER BY d
        `
      : await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', p."createdAt")::date as d, count(*)::bigint as c
          FROM "PromptLog" p
          JOIN "User" u ON p."userId" = u.id
          WHERE u.role <> 'super_admin'
          GROUP BY date_trunc('day', p."createdAt")::date
          ORDER BY d
        `;

  const loginsByDay = poolOnly
    ? range
      ? await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', l."createdAt")::date as d, count(*)::bigint as c
          FROM "LoginEvent" l
          JOIN "User" u ON l."userId" = u.id
          WHERE u."companyId" = ${platformCompanyId}
            AND u.role <> 'super_admin'
            AND l."createdAt" >= ${range.from}
            AND l."createdAt" <= ${range.to}
          GROUP BY date_trunc('day', l."createdAt")::date
          ORDER BY d
        `
      : await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', l."createdAt")::date as d, count(*)::bigint as c
          FROM "LoginEvent" l
          JOIN "User" u ON l."userId" = u.id
          WHERE u."companyId" = ${platformCompanyId}
            AND u.role <> 'super_admin'
          GROUP BY date_trunc('day', l."createdAt")::date
          ORDER BY d
        `
    : range
      ? await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', l."createdAt")::date as d, count(*)::bigint as c
          FROM "LoginEvent" l
          JOIN "User" u ON l."userId" = u.id
          WHERE u.role <> 'super_admin'
            AND l."createdAt" >= ${range.from}
            AND l."createdAt" <= ${range.to}
          GROUP BY date_trunc('day', l."createdAt")::date
          ORDER BY d
        `
      : await prisma.$queryRaw<DayRow[]>`
          SELECT date_trunc('day', l."createdAt")::date as d, count(*)::bigint as c
          FROM "LoginEvent" l
          JOIN "User" u ON l."userId" = u.id
          WHERE u.role <> 'super_admin'
          GROUP BY date_trunc('day', l."createdAt")::date
          ORDER BY d
        `;

  return mergePlatformTimeSeries(usersByDay, promptsByDay, loginsByDay);
}
