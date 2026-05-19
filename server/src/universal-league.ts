import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CompetitionMemberRole } from "@prisma/client";
import { isPlatformCompanySlug } from "./org-seat";

/** Slug fijo de la competencia “pool público” (una por plataforma). */
export const UNIVERSAL_COMPETITION_SLUG = "liga-universal-promptplay";

/** Liga universal F1 (misma empresa platform-internal). */
export const UNIVERSAL_F1_COMPETITION_SLUG = "liga-universal-f1-promptplay";

async function allocateInviteCode(prisma: PrismaClient): Promise<string> {
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

async function allocateF1InviteCode(prisma: PrismaClient): Promise<string> {
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
