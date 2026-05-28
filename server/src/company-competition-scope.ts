import type { CompanyCompetitionScope, PrismaClient } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import type { AuthedRequest } from "./auth";
import { isPlatformCompanySlug } from "./org-seat";

export type { CompanyCompetitionScope };

const PLATFORM_CONFIG_ID = "default";

export function scopeAllowsDiscipline(
  scope: CompanyCompetitionScope,
  discipline: "football" | "f1"
): boolean {
  if (scope === "all") return true;
  return scope === discipline;
}

export async function getPlatformDefaultCompetitionScope(
  prisma: PrismaClient
): Promise<CompanyCompetitionScope> {
  const row = await prisma.platformConfig.findUnique({
    where: { id: PLATFORM_CONFIG_ID },
    select: { defaultCompetitionScope: true },
  });
  return row?.defaultCompetitionScope ?? "all";
}

export async function resolveCompanyCompetitionScope(
  prisma: PrismaClient,
  companyId: string,
  companySlug?: string
): Promise<CompanyCompetitionScope> {
  if (companySlug && isPlatformCompanySlug(companySlug)) return "all";
  const company = companySlug
    ? null
    : await prisma.company.findUnique({
        where: { id: companyId },
        select: { slug: true },
      });
  const slug = companySlug ?? company?.slug;
  if (slug && isPlatformCompanySlug(slug)) return "all";

  const config = await prisma.companyConfig.findUnique({
    where: { companyId },
    select: { competitionScope: true },
  });
  if (config?.competitionScope) return config.competitionScope;
  return getPlatformDefaultCompetitionScope(prisma);
}

export function makeRequireCompanyDiscipline(prisma: PrismaClient, discipline: "football" | "f1") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { companyId } = (req as AuthedRequest).auth;
    const scope = await resolveCompanyCompetitionScope(prisma, companyId);
    if (!scopeAllowsDiscipline(scope, discipline)) {
      res.status(403).json({ error: "competition_scope_forbidden", scope, discipline });
      return;
    }
    next();
  };
}

export async function assertCompanyDisciplineAllowed(
  prisma: PrismaClient,
  companyId: string,
  discipline: "football" | "f1"
): Promise<{ ok: true } | { ok: false; scope: CompanyCompetitionScope }> {
  const scope = await resolveCompanyCompetitionScope(prisma, companyId);
  if (!scopeAllowsDiscipline(scope, discipline)) {
    return { ok: false, scope };
  }
  return { ok: true };
}
