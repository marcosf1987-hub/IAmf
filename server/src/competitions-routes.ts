import type { Express, Request } from "express";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CompetitionMemberRole } from "@prisma/client";
import type { AuthedRequest } from "./auth";
import { requireAuth } from "./auth";
import {
  FREE_MAX_COMPETITIONS_PER_USER,
  FREE_MAX_MEMBERS_PER_COMPETITION,
  FREE_MIN_MEMBERS,
} from "./competition-constants";
import { isPlatformCompanySlug } from "./org-seat";
import { createCompetitionSchema, inviteCompetitionMemberSchema } from "./validators";

function routeParamId(req: Request): string | undefined {
  const raw = req.params.id;
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

function slugifyName(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return s.length > 0 ? s : "liga";
}

export function registerCompetitionRoutes(app: Express, prisma: PrismaClient): void {
  app.get("/competitions/mine", requireAuth, async (req, res) => {
    const { userId, companyId } = (req as AuthedRequest).auth;
    const rows = await prisma.competitionMember.findMany({
      where: { userId },
      include: {
        competition: {
          select: {
            id: true,
            name: true,
            slug: true,
            maxMembers: true,
            createdAt: true,
            createdById: true,
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, competitionLimit: true },
    });
    if (!company) {
      res.status(400).json({ error: "no_company" });
      return;
    }

    const platform = isPlatformCompanySlug(company.slug);
    let quota: {
      scope: "user" | "company";
      createdByMe: number;
      maxCreatedByMe: number | null;
      companyTotal: number | null;
      maxCompany: number | null;
    };
    if (platform) {
      const createdByMe = await prisma.competition.count({
        where: { createdById: userId },
      });
      quota = {
        scope: "user",
        createdByMe,
        maxCreatedByMe: FREE_MAX_COMPETITIONS_PER_USER,
        companyTotal: null,
        maxCompany: null,
      };
    } else {
      const companyTotal = await prisma.competition.count({
        where: { companyId },
      });
      quota = {
        scope: "company",
        createdByMe: await prisma.competition.count({ where: { createdById: userId } }),
        maxCreatedByMe: null,
        companyTotal,
        maxCompany: company.competitionLimit,
      };
    }

    res.status(200).json({
      competitions: rows.map((r) => ({
        ...r.competition,
        memberCount: r.competition._count.members,
        myRole: r.role,
        isCreator: r.competition.createdById === userId,
      })),
      quota,
    });
  });

  app.post("/competitions", requireAuth, async (req, res) => {
    const parsed = createCompetitionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }

    const { userId, companyId } = (req as AuthedRequest).auth;
    const { name, maxMembers } = parsed.data;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true, competitionLimit: true },
    });
    if (!company) {
      res.status(400).json({ error: "no_company" });
      return;
    }

    const platform = isPlatformCompanySlug(company.slug);

    if (platform) {
      const created = await prisma.competition.count({
        where: { createdById: userId },
      });
      if (created >= FREE_MAX_COMPETITIONS_PER_USER) {
        res.status(403).json({
          error: "competition_limit",
          message: `Puedes crear hasta ${FREE_MAX_COMPETITIONS_PER_USER} competencias en la cuenta gratuita.`,
        });
        return;
      }
      if (maxMembers > FREE_MAX_MEMBERS_PER_COMPETITION || maxMembers < FREE_MIN_MEMBERS) {
        res.status(400).json({
          error: "invalid_max_members",
          message: `En la cuenta gratuita el tamaño de la liga debe estar entre ${FREE_MIN_MEMBERS} y ${FREE_MAX_MEMBERS_PER_COMPETITION}.`,
        });
        return;
      }
    } else {
      if (company.competitionLimit != null) {
        const n = await prisma.competition.count({ where: { companyId } });
        if (n >= company.competitionLimit) {
          res.status(403).json({
            error: "competition_limit",
            message: "La empresa alcanzó el máximo de competencias permitido.",
          });
          return;
        }
      }
      if (maxMembers < FREE_MIN_MEMBERS || maxMembers > 500) {
        res.status(400).json({ error: "invalid_max_members" });
        return;
      }
    }

    let slug = `${slugifyName(name)}-${randomBytes(4).toString("hex")}`;
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.competition.findUnique({ where: { slug }, select: { id: true } });
      if (!clash) break;
      slug = `${slugifyName(name)}-${randomBytes(4).toString("hex")}`;
    }

    const comp = await prisma.competition.create({
      data: {
        name: name.trim(),
        slug,
        companyId,
        createdById: userId,
        maxMembers,
        members: {
          create: {
            userId,
            role: CompetitionMemberRole.competition_admin,
          },
        },
      },
      select: { id: true, name: true, slug: true, maxMembers: true, createdAt: true },
    });

    res.status(201).json({ competition: comp });
  });

  app.post("/competitions/:id/invite", requireAuth, async (req, res) => {
    const competitionId = routeParamId(req);
    if (!competitionId) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const parsed = inviteCompetitionMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const email = parsed.data.email.trim().toLowerCase();
    const { userId } = (req as AuthedRequest).auth;

    const membership = await prisma.competitionMember.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
      include: {
        competition: true,
      },
    });
    if (!membership || membership.role !== CompetitionMemberRole.competition_admin) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const count = await prisma.competitionMember.count({
      where: { competitionId },
    });
    if (count >= membership.competition.maxMembers) {
      res.status(400).json({ error: "competition_full" });
      return;
    }

    const invitee = await prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (!invitee || invitee.status !== "active") {
      res.status(404).json({
        error: "user_not_found",
        message: "No hay un usuario activo con ese email. Tiene que registrarse primero.",
      });
      return;
    }

    const existing = await prisma.competitionMember.findUnique({
      where: { competitionId_userId: { competitionId, userId: invitee.id } },
    });
    if (existing) {
      res.status(409).json({ error: "already_member" });
      return;
    }

    await prisma.competitionMember.create({
      data: {
        competitionId,
        userId: invitee.id,
        role: CompetitionMemberRole.member,
      },
    });

    res.status(201).json({ ok: true });
  });

  app.get("/competitions/:id", requireAuth, async (req, res) => {
    const competitionId = routeParamId(req);
    if (!competitionId) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const { userId } = (req as AuthedRequest).auth;

    const membership = await prisma.competitionMember.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
    });
    if (!membership) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const comp = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, fullName: true },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
    if (!comp) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.status(200).json({
      competition: {
        id: comp.id,
        name: comp.name,
        slug: comp.slug,
        maxMembers: comp.maxMembers,
        createdAt: comp.createdAt,
        createdById: comp.createdById,
        memberCount: comp.members.length,
      },
      myRole: membership.role,
      members: comp.members.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        fullName: m.user.fullName,
        role: m.role,
      })),
    });
  });

  app.delete("/competitions/:id/membership", requireAuth, async (req, res) => {
    const competitionId = routeParamId(req);
    if (!competitionId) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const { userId } = (req as AuthedRequest).auth;

    const membership = await prisma.competitionMember.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
    });
    if (!membership) {
      res.status(404).json({ error: "not_member" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.competitionMember.delete({
        where: { competitionId_userId: { competitionId, userId } },
      });
      const remaining = await tx.competitionMember.count({
        where: { competitionId },
      });
      if (remaining === 0) {
        await tx.competition.delete({ where: { id: competitionId } });
      }
    });

    res.status(200).json({ ok: true });
  });
}
