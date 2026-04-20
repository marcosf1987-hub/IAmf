import crypto from "node:crypto";
import { randomBytes } from "node:crypto";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { CompetitionMemberRole } from "@prisma/client";
import { signAccessToken, requireAuth, type AuthedRequest } from "./auth";
import { hashPassword } from "./password";
import { inviteAcceptSchema } from "./validators";
import { ensureUniversalLeagueMembership } from "./universal-league";
import { sendCompetitionInvitationEmail } from "./mail";
import { envString } from "./env-dynamic";
import { EK } from "./env-key-names";

function hashInviteToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function frontendBase(): string {
  return (envString(EK.frontend)?.trim() || "http://localhost:5173").replace(/\/+$/, "");
}

export function registerCompetitionInviteRoutes(app: Express, prisma: PrismaClient): void {
  app.get("/auth/competition-invite/preview", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token || token.length < 10) {
      res.status(400).json({ error: "invalid_token" });
      return;
    }
    const tokenHash = hashInviteToken(token);
    const inv = await prisma.competitionInvitation.findFirst({
      where: { tokenHash },
      include: {
        competition: {
          select: {
            name: true,
            company: { select: { name: true, slug: true } },
          },
        },
        invitedBy: { select: { fullName: true, email: true } },
      },
    });
    if (!inv) {
      res.status(404).json({ error: "invite_not_found" });
      return;
    }
    if (inv.acceptedAt) {
      res.status(410).json({ error: "invite_already_used" });
      return;
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ error: "invite_expired" });
      return;
    }
    const existing = await prisma.user.findUnique({
      where: { email: inv.email },
      select: { id: true },
    });
    res.status(200).json({
      competitionName: inv.competition.name,
      companyName: inv.competition.company.name,
      email: inv.email,
      inviterLabel: inv.invitedBy?.fullName || inv.invitedBy?.email || null,
      accountExists: Boolean(existing),
    });
  });

  app.post("/auth/competition-invite/accept", async (req, res) => {
    const parsed = inviteAcceptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const { token, password, fullName } = parsed.data;
    const tokenHash = hashInviteToken(token);
    const inv = await prisma.competitionInvitation.findFirst({
      where: { tokenHash },
      include: { competition: true },
    });
    if (!inv) {
      res.status(404).json({ error: "invite_not_found" });
      return;
    }
    if (inv.acceptedAt) {
      res.status(409).json({ error: "invite_already_used" });
      return;
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ error: "invite_expired" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: inv.email } });
    if (existing) {
      res.status(409).json({
        error: "email_already_registered",
        message:
          "Ya tenés cuenta con este email. Iniciá sesión y usá «Ya tengo invitación» desde el enlace o reclamá la invitación desde la app.",
      });
      return;
    }

    const platformCompany = await prisma.company.findUnique({
      where: { slug: "platform-internal" },
    });
    if (!platformCompany) {
      res.status(503).json({ error: "platform_not_configured" });
      return;
    }

    const count = await prisma.competitionMember.count({
      where: { competitionId: inv.competitionId },
    });
    if (count >= inv.competition.maxMembers) {
      res.status(400).json({ error: "competition_full" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: inv.email,
          passwordHash,
          fullName: fullName?.trim() ? fullName.trim() : null,
          companyId: platformCompany.id,
          role: "member",
          status: "active",
        },
        select: { id: true, email: true, fullName: true, role: true, companyId: true },
      });
      await tx.competitionMember.create({
        data: {
          competitionId: inv.competitionId,
          userId: u.id,
          role: CompetitionMemberRole.member,
        },
      });
      await tx.competitionInvitation.update({
        where: { id: inv.id },
        data: { acceptedAt: new Date() },
      });
      return u;
    });

    try {
      await ensureUniversalLeagueMembership(prisma, user.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("ensureUniversalLeagueMembership (competition-invite accept):", e);
    }

    const access = signAccessToken({
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
    });
    res.status(201).json({ token: access, user });
  });

  app.post("/auth/competition-invite/claim", requireAuth, async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (!token || token.length < 10) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const { userId } = (req as AuthedRequest).auth;
    const authUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true },
    });
    if (!authUser || authUser.status !== "active") {
      res.status(401).json({ error: "invalid_token" });
      return;
    }

    const tokenHash = hashInviteToken(token);
    const inv = await prisma.competitionInvitation.findFirst({
      where: { tokenHash },
      include: { competition: true },
    });
    if (!inv) {
      res.status(404).json({ error: "invite_not_found" });
      return;
    }
    if (inv.acceptedAt) {
      res.status(409).json({ error: "invite_already_used" });
      return;
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      res.status(410).json({ error: "invite_expired" });
      return;
    }
    if (authUser.email.toLowerCase() !== inv.email.toLowerCase()) {
      res.status(403).json({
        error: "email_mismatch",
        message: "Tenés que iniciar sesión con el mismo email al que se envió la invitación.",
      });
      return;
    }

    const existingMember = await prisma.competitionMember.findUnique({
      where: {
        competitionId_userId: { competitionId: inv.competitionId, userId: authUser.id },
      },
    });
    if (existingMember) {
      await prisma.competitionInvitation.update({
        where: { id: inv.id },
        data: { acceptedAt: new Date() },
      });
      res.status(200).json({ ok: true, alreadyMember: true, competitionId: inv.competitionId });
      return;
    }

    const count = await prisma.competitionMember.count({
      where: { competitionId: inv.competitionId },
    });
    if (count >= inv.competition.maxMembers) {
      res.status(400).json({ error: "competition_full" });
      return;
    }

    await prisma.$transaction([
      prisma.competitionMember.create({
        data: {
          competitionId: inv.competitionId,
          userId: authUser.id,
          role: CompetitionMemberRole.member,
        },
      }),
      prisma.competitionInvitation.update({
        where: { id: inv.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    res.status(201).json({ ok: true, competitionId: inv.competitionId });
  });
}

/** Crear invitación por email + enviar (usa desde competitions-routes). */
export async function createCompetitionEmailInvitation(params: {
  prisma: PrismaClient;
  competitionId: string;
  email: string;
  invitedById: string;
}): Promise<{ inviteUrl: string; emailSent: boolean; emailError?: string }> {
  const { prisma, competitionId, email, invitedById } = params;
  const normalized = email.trim().toLowerCase();
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.competitionInvitation.deleteMany({
    where: {
      competitionId,
      email: normalized,
      acceptedAt: null,
    },
  });

  await prisma.competitionInvitation.create({
    data: {
      competitionId,
      email: normalized,
      tokenHash,
      expiresAt,
      invitedById,
    },
  });

  const inviteUrl = `${frontendBase()}/invite/liga/accept?token=${encodeURIComponent(rawToken)}`;
  const comp = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: { name: true },
  });
  const sent = await sendCompetitionInvitationEmail({
    to: normalized,
    competitionName: comp?.name ?? "Liga",
    inviteUrl,
  });
  return {
    inviteUrl,
    emailSent: sent.ok,
    ...(sent.error ? { emailError: sent.error } : {}),
  };
}
