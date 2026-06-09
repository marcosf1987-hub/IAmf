import { randomBytes } from "node:crypto";
import { CompetitionMemberRole, type Prisma, type PrismaClient } from "@prisma/client";

type PrismaDb = PrismaClient | Prisma.TransactionClient;
import { isPlatformCompanySlug } from "./org-seat";

/** Slug fijo de la competencia “pool público” (una por plataforma). */
export const UNIVERSAL_COMPETITION_SLUG = "liga-universal-promptplay";

/** Liga universal F1 (misma empresa platform-internal). */
export const UNIVERSAL_F1_COMPETITION_SLUG = "liga-universal-f1-promptplay";

export function companyUniversalFootballSlug(companySlug: string): string {
  return `liga-universal-${companySlug}`;
}

export function companyUniversalF1Slug(companySlug: string): string {
  return `liga-universal-f1-${companySlug}`;
}

/** Slugs de ligas universales del pool o de empresas B2B (no editables / no eliminables). */
export function isProtectedUniversalCompetitionSlug(slug: string): boolean {
  if (slug === UNIVERSAL_COMPETITION_SLUG || slug === UNIVERSAL_F1_COMPETITION_SLUG) return true;
  if (slug.startsWith("liga-universal-f1-")) return true;
  return slug.startsWith("liga-universal-");
}

async function allocateInviteCode(prisma: PrismaDb): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const code = `MUNDIAL-IA-${randomBytes(3).toString("hex").toUpperCase()}`;
    const clash = await prisma.competition.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  throw new Error("invite_code_exhausted");
}

async function allocateF1InviteCode(prisma: PrismaDb): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const code = `F1-IA-${randomBytes(3).toString("hex").toUpperCase()}`;
    const clash = await prisma.competition.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  throw new Error("invite_code_exhausted");
}

/**
 * Usuarios nuevos por registro público o Google (empresa platform-internal).
 * No aplica a quien entra solo por invitación B2B (otra empresa).
 * Super admin de plataforma no entra en la liga automática.
 */
export async function ensureUniversalLeagueMembership(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, companyId: true },
  });
  if (!user || user.role === "super_admin") return;

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { slug: true },
  });
  if (!company || !isPlatformCompanySlug(company.slug)) return;

  const platform = await prisma.company.findUnique({
    where: { slug: "platform-internal" },
    select: { id: true },
  });
  if (!platform) return;

  let comp = await prisma.competition.findFirst({
    where: { companyId: platform.id, slug: UNIVERSAL_COMPETITION_SLUG },
  });

  if (!comp) {
    comp = await prisma.competition.create({
      data: {
        name: "Liga universal",
        slug: UNIVERSAL_COMPETITION_SLUG,
        discipline: "football",
        inviteCode: await allocateInviteCode(prisma),
        description:
          "Compite con todos los usuarios que generaron predicciones para el Mundial.",
        companyId: platform.id,
        createdById: userId,
        maxMembers: 999_999,
        members: {
          create: {
            userId,
            role: CompetitionMemberRole.competition_admin,
          },
        },
      },
    });
  } else {
    await prisma.competition.update({
      where: { id: comp.id },
      data: {
        description: "Compite con todos los usuarios que generaron predicciones para el Mundial.",
      },
    });
    await prisma.competitionMember.upsert({
      where: {
        competitionId_userId: { competitionId: comp.id, userId },
      },
      create: {
        competitionId: comp.id,
        userId,
        role: CompetitionMemberRole.member,
      },
      update: {},
    });
  }

  let compF1 = await prisma.competition.findFirst({
    where: { companyId: platform.id, slug: UNIVERSAL_F1_COMPETITION_SLUG },
  });
  if (!compF1) {
    await prisma.competition.create({
      data: {
        name: "Liga universal F1",
        slug: UNIVERSAL_F1_COMPETITION_SLUG,
        discipline: "f1",
        inviteCode: await allocateF1InviteCode(prisma),
        description: "Compite con todos los usuarios que generaron predicciones de F1",
        companyId: platform.id,
        createdById: userId,
        maxMembers: 999_999,
        members: {
          create: {
            userId,
            role: CompetitionMemberRole.competition_admin,
          },
        },
      },
    });
  } else {
    await prisma.competition.update({
      where: { id: compF1.id },
      data: { description: "Compite con todos los usuarios que generaron predicciones de F1" },
    });
    await prisma.competitionMember.upsert({
      where: {
        competitionId_userId: { competitionId: compF1.id, userId },
      },
      create: {
        competitionId: compF1.id,
        userId,
        role: CompetitionMemberRole.member,
      },
      update: {},
    });
  }
}

/** Crea las ligas universales de una empresa B2B (Mundial + F1) si aún no existen. */
export async function ensureCompanyUniversalLeagues(
  prisma: PrismaDb,
  companyId: string,
  createdByUserId: string
): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { slug: true },
  });
  if (!company || isPlatformCompanySlug(company.slug)) return;

  const footballSlug = companyUniversalFootballSlug(company.slug);
  const f1Slug = companyUniversalF1Slug(company.slug);

  let comp = await prisma.competition.findFirst({
    where: { companyId, slug: footballSlug },
  });
  if (!comp) {
    await prisma.competition.create({
      data: {
        name: "Liga universal",
        slug: footballSlug,
        discipline: "football",
        inviteCode: await allocateInviteCode(prisma),
        description:
          "Compite con todos los usuarios de tu empresa que generaron predicciones para el Mundial.",
        companyId,
        createdById: createdByUserId,
        maxMembers: 999_999,
        members: {
          create: {
            userId: createdByUserId,
            role: CompetitionMemberRole.competition_admin,
          },
        },
      },
    });
  }

  let compF1 = await prisma.competition.findFirst({
    where: { companyId, slug: f1Slug },
  });
  if (!compF1) {
    await prisma.competition.create({
      data: {
        name: "Liga universal F1",
        slug: f1Slug,
        discipline: "f1",
        inviteCode: await allocateF1InviteCode(prisma),
        description:
          "Compite con todos los usuarios de tu empresa que generaron predicciones de F1.",
        companyId,
        createdById: createdByUserId,
        maxMembers: 999_999,
        members: {
          create: {
            userId: createdByUserId,
            role: CompetitionMemberRole.competition_admin,
          },
        },
      },
    });
  }
}

async function resolveCompanyUniversalBootstrapUser(
  prisma: PrismaDb,
  companyId: string
): Promise<string | null> {
  const orgAdmin = await prisma.user.findFirst({
    where: { companyId, role: "org_admin", status: "active" },
    select: { id: true },
  });
  if (orgAdmin) return orgAdmin.id;
  const fallback = await prisma.user.findFirst({
    where: { companyId, status: "active", role: { in: ["org_admin", "member"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

/** Usuario B2B activo: asegura ligas universales de su empresa y lo une como member. */
export async function ensureCompanyUniversalLeagueMembership(
  prisma: PrismaDb,
  userId: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, companyId: true },
  });
  if (!user || user.role === "super_admin") return;

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { id: true, slug: true },
  });
  if (!company || isPlatformCompanySlug(company.slug)) return;

  const bootstrapUserId = (await resolveCompanyUniversalBootstrapUser(prisma, company.id)) ?? userId;
  await ensureCompanyUniversalLeagues(prisma, company.id, bootstrapUserId);

  const footballSlug = companyUniversalFootballSlug(company.slug);
  const f1Slug = companyUniversalF1Slug(company.slug);
  const leagues = await prisma.competition.findMany({
    where: {
      companyId: company.id,
      slug: { in: [footballSlug, f1Slug] },
    },
    select: { id: true },
  });

  for (const league of leagues) {
    await prisma.competitionMember.upsert({
      where: {
        competitionId_userId: { competitionId: league.id, userId },
      },
      create: {
        competitionId: league.id,
        userId,
        role: CompetitionMemberRole.member,
      },
      update: {},
    });
  }
}

/**
 * Empresas B2B ya existentes: crea ligas universales faltantes y sincroniza miembros activos.
 * Idempotente; seguro ejecutar en cada arranque del servidor.
 */
export async function backfillAllCompanyUniversalLeagues(
  prisma: PrismaClient
): Promise<{ companies: number; users: number }> {
  const companies = await prisma.company.findMany({
    where: { NOT: { slug: "platform-internal" } },
    select: { id: true },
  });

  let usersSynced = 0;
  for (const company of companies) {
    const bootstrapUserId = await resolveCompanyUniversalBootstrapUser(prisma, company.id);
    if (!bootstrapUserId) continue;

    await ensureCompanyUniversalLeagues(prisma, company.id, bootstrapUserId);

    const users = await prisma.user.findMany({
      where: {
        companyId: company.id,
        status: "active",
        role: { in: ["org_admin", "member"] },
      },
      select: { id: true },
    });

    for (const u of users) {
      await ensureCompanyUniversalLeagueMembership(prisma, u.id);
      usersSynced += 1;
    }
  }

  return { companies: companies.length, users: usersSynced };
}

/** Quita al usuario de las ligas universales del pool público (platform-internal). */
export async function removePlatformUniversalLeagueMembership(
  prisma: PrismaDb,
  userId: string
): Promise<void> {
  const platform = await prisma.company.findUnique({
    where: { slug: "platform-internal" },
    select: { id: true },
  });
  if (!platform) return;

  const comps = await prisma.competition.findMany({
    where: {
      companyId: platform.id,
      slug: { in: [UNIVERSAL_COMPETITION_SLUG, UNIVERSAL_F1_COMPETITION_SLUG] },
    },
    select: { id: true },
  });
  if (comps.length === 0) return;

  await prisma.competitionMember.deleteMany({
    where: {
      userId,
      competitionId: { in: comps.map((c) => c.id) },
    },
  });
}
