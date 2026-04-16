import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CompetitionMemberRole } from "@prisma/client";
import { isPlatformCompanySlug } from "./org-seat";

/** Slug fijo de la competencia “pool público” (una por plataforma). */
export const UNIVERSAL_COMPETITION_SLUG = "liga-universal-promptplay";

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

/**
 * Usuarios nuevos por registro público u OAuth (empresa platform-internal).
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
        inviteCode: await allocateInviteCode(prisma),
        description:
          "Pool de todos los usuarios que se registran sin invitación de empresa (ranking global dentro de la plataforma).",
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
    return;
  }

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
