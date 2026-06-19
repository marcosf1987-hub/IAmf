import type { Prisma, PrismaClient } from "@prisma/client";
import type { AdminDateRange } from "./admin-date-range";
import { loadPlatformUserMetrics } from "./platform-metrics";

export type PlatformExportFilters = {
  q?: string;
  company?: string;
};

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function csvRow(cells: (string | number | boolean | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

export function buildPlatformUsersListWhere(filters: PlatformExportFilters = {}): Prisma.UserWhereInput {
  const qRaw = filters.q?.trim() ?? "";
  const companyRaw = filters.company?.trim() ?? "";
  return {
    role: { not: "super_admin" },
    ...(qRaw.length > 0
      ? {
          OR: [
            { email: { contains: qRaw, mode: "insensitive" } },
            { fullName: { contains: qRaw, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(companyRaw.length > 0
      ? {
          company: {
            OR: [
              { name: { contains: companyRaw, mode: "insensitive" } },
              { slug: { contains: companyRaw, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
}

export function platformExportFilename(
  base: string,
  range?: AdminDateRange
): string {
  if (!range) return `${base}.csv`;
  const from = range.from.toISOString().slice(0, 10);
  const to = range.to.toISOString().slice(0, 10);
  return `${base}_${from}_${to}.csv`;
}

export async function buildPlatformUsersCsv(
  prisma: PrismaClient,
  range?: AdminDateRange,
  filters: PlatformExportFilters = {}
): Promise<string> {
  const users = await prisma.user.findMany({
    where: buildPlatformUsersListWhere(filters),
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      status: true,
      hiddenFromRankings: true,
      createdAt: true,
      company: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const metricsByUser = await loadPlatformUserMetrics(
    prisma,
    users.map((u) => u.id),
    range
  );

  const header = csvRow([
    "email",
    "fullName",
    "role",
    "status",
    "company",
    "companySlug",
    "hiddenFromRankings",
    "createdAt",
    "sessionCount",
    "prodePrompts",
    "totalPrompts",
    "footballPredictions",
    "f1Predictions",
    "hasGuidelines",
    "lastActivityAt",
  ]);

  const rows = users.map((u) => {
    const m = metricsByUser.get(u.id) ?? {
      sessionCount: 0,
      prodePrompts: 0,
      totalPrompts: 0,
      footballPredictions: 0,
      f1Predictions: 0,
      hasGuidelines: false,
      lastActivityAt: null,
    };
    return csvRow([
      u.email,
      u.fullName ?? "",
      u.role,
      u.status,
      u.company.name,
      u.company.slug,
      u.hiddenFromRankings,
      u.createdAt.toISOString(),
      m.sessionCount,
      m.prodePrompts,
      m.totalPrompts,
      m.footballPredictions,
      m.f1Predictions,
      m.hasGuidelines,
      m.lastActivityAt ?? "",
    ]);
  });

  return `${header}\n${rows.join("\n")}`;
}

async function loadPlatformUserRefs(
  prisma: PrismaClient,
  filters: PlatformExportFilters
): Promise<Map<string, { email: string; companySlug: string }>> {
  const users = await prisma.user.findMany({
    where: buildPlatformUsersListWhere(filters),
    select: {
      id: true,
      email: true,
      company: { select: { slug: true } },
    },
  });
  return new Map(users.map((u) => [u.id, { email: u.email, companySlug: u.company.slug }]));
}

export async function buildPlatformPromptsCsv(
  prisma: PrismaClient,
  range?: AdminDateRange,
  filters: PlatformExportFilters = {}
): Promise<string> {
  const userRefs = await loadPlatformUserRefs(prisma, filters);
  const userIds = [...userRefs.keys()];
  if (userIds.length === 0) {
    return csvRow(["email", "companySlug", "createdAt", "model", "promptText", "responseText"]);
  }

  const logs = await prisma.promptLog.findMany({
    where: {
      userId: { in: userIds },
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      userId: true,
      promptText: true,
      responseText: true,
      model: true,
      createdAt: true,
    },
  });

  const header = csvRow(["email", "companySlug", "createdAt", "model", "promptText", "responseText"]);
  const rows = logs.map((l) => {
    const ref = userRefs.get(l.userId);
    return csvRow([
      ref?.email ?? "",
      ref?.companySlug ?? "",
      l.createdAt.toISOString(),
      l.model,
      l.promptText ?? "",
      l.responseText ?? "",
    ]);
  });

  return `${header}\n${rows.join("\n")}`;
}

export async function buildPlatformLoginsCsv(
  prisma: PrismaClient,
  range?: AdminDateRange,
  filters: PlatformExportFilters = {}
): Promise<string> {
  const userRefs = await loadPlatformUserRefs(prisma, filters);
  const userIds = [...userRefs.keys()];
  if (userIds.length === 0) {
    return csvRow(["email", "companySlug", "createdAt", "ip", "userAgent"]);
  }

  const events = await prisma.loginEvent.findMany({
    where: {
      userId: { in: userIds },
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { userId: true, ip: true, userAgent: true, createdAt: true },
  });

  const header = csvRow(["email", "companySlug", "createdAt", "ip", "userAgent"]);
  const rows = events.map((l) => {
    const ref = userRefs.get(l.userId);
    return csvRow([
      ref?.email ?? "",
      ref?.companySlug ?? "",
      l.createdAt.toISOString(),
      l.ip ?? "",
      l.userAgent ?? "",
    ]);
  });

  return `${header}\n${rows.join("\n")}`;
}

export function sendPlatformCsv(
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { send: (b: string) => void } },
  filename: string,
  csv: string
): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  res.status(200).send("\uFEFF" + csv);
}
