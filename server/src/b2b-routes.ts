import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { signAccessToken, verifyAccessToken, getAccessTokenFromRequest, type AuthedRequest } from "./auth";
import { hashPassword } from "./password";
import {
  adminAiConfigSchema,
  inviteAcceptSchema,
  orgInviteSchema,
  platformCreateCompanySchema,
  platformPatchCompanySchema,
  platformResetOrgAdminPasswordSchema,
  platformSettingsSchema,
} from "./validators";
import {
  getPlatformDefaultCompetitionScope,
  resolveCompanyCompetitionScope,
} from "./company-competition-scope";
import { encrypt } from "./crypto-util";
import { buildMeResponse } from "./me-response";
import { buildOrgSeatSnapshot, isPlatformCompanySlug } from "./org-seat";
import { setSessionCookies } from "./session-cookie";
import { UNIVERSAL_COMPETITION_SLUG } from "./universal-league";
import { isMailConfigured, sendInvitationEmail } from "./mail";
import { envString } from "./env-dynamic";
import { EK } from "./env-key-names";
import { replyGenericInviteError } from "./invite-security";

function frontendBase(): string {
  return (envString(EK.frontend)?.trim() || "http://localhost:5173").replace(/\/+$/, "");
}

function billingCheckoutBase(): string | null {
  const u = envString(EK.billingCheckout)?.trim();
  return u && u.length > 0 ? u : null;
}

function hashInviteToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function requireSuperAdmin(
  prisma: PrismaClient,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = getAccessTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: "missing_token" });
      return;
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, companyId: true, status: true, tokenVersion: true },
    });
    if (
      !user ||
      user.status !== "active" ||
      user.role !== "super_admin" ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    (req as AuthedRequest).auth = {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
      tokenVersion: user.tokenVersion,
    };
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("requireSuperAdmin:", err);
    res.status(500).json({ error: "server_error" });
  }
}

export async function requireOrgAdmin(
  prisma: PrismaClient,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = getAccessTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ error: "missing_token" });
      return;
    }
    const payload = verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, companyId: true, status: true, tokenVersion: true },
    });
    if (
      !user ||
      user.status !== "active" ||
      user.role !== "org_admin" ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    (req as AuthedRequest).auth = {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
      tokenVersion: user.tokenVersion,
    };
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("requireOrgAdmin:", err);
    res.status(500).json({ error: "server_error" });
  }
}

function wrapSuper(prisma: PrismaClient) {
  return (req: Request, res: Response, next: NextFunction) => {
    void requireSuperAdmin(prisma, req, res, next);
  };
}

function wrapOrg(prisma: PrismaClient) {
  return (req: Request, res: Response, next: NextFunction) => {
    void requireOrgAdmin(prisma, req, res, next);
  };
}

function routeParamId(req: Request): string | undefined {
  const raw = req.params.id;
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

function routeParamUserId(req: Request): string | undefined {
  const raw = req.params.userId;
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

export function registerB2BRoutes(app: Express, prisma: PrismaClient): void {
  const superAuth = wrapSuper(prisma);
  const orgAuth = wrapOrg(prisma);

  app.get("/auth/invite/preview", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token || token.length < 10) {
      res.status(400).json({ error: "invalid_token" });
      return;
    }
    const tokenHash = hashInviteToken(token);
    const inv = await prisma.invitation.findFirst({
      where: { tokenHash },
      include: { company: { select: { name: true, slug: true } } },
    });
    if (!inv) {
      replyGenericInviteError(res);
      return;
    }
    if (inv.acceptedAt) {
      replyGenericInviteError(res);
      return;
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      replyGenericInviteError(res);
      return;
    }
    res.status(200).json({
      companyName: inv.company.name,
      companySlug: inv.company.slug,
      email: inv.email,
    });
  });

  app.post("/auth/invite/accept", async (req, res) => {
    const parsed = inviteAcceptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const { token, password, fullName } = parsed.data;
    const tokenHash = hashInviteToken(token);
    const inv = await prisma.invitation.findFirst({
      where: { tokenHash },
      include: { company: true },
    });
    if (!inv) {
      replyGenericInviteError(res);
      return;
    }
    if (inv.acceptedAt) {
      replyGenericInviteError(res);
      return;
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      replyGenericInviteError(res);
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: inv.email } });
    if (existing) {
      res.status(409).json({ error: "email_in_use", message: "Ya existe una cuenta con este email." });
      return;
    }

    const company = inv.company;
    if (!isPlatformCompanySlug(company.slug)) {
      const active = await prisma.user.count({
        where: {
          companyId: company.id,
          status: "active",
          role: { in: ["org_admin", "member"] },
        },
      });
      if (active >= company.seatLimit) {
        res.status(403).json({ error: "seats_exceeded" });
        return;
      }
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: inv.email,
          passwordHash,
          fullName: fullName ?? null,
          companyId: inv.companyId,
          role: "member",
          status: "active",
        },
        select: { id: true, email: true, fullName: true, role: true, companyId: true, tokenVersion: true },
      });
      await tx.invitation.update({
        where: { id: inv.id },
        data: { acceptedAt: new Date() },
      });
      return u;
    });

    const access = signAccessToken({
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
      tokenVersion: user.tokenVersion,
    });
    const me = await buildMeResponse(prisma, user.id);
    if (!me) {
      res.status(500).json({ error: "server_error" });
      return;
    }
    setSessionCookies(res, access);
    res.status(201).json(me);
  });

  app.get("/org/usage", orgAuth, async (req, res) => {
    const { companyId } = (req as AuthedRequest).auth;
    const snap = await buildOrgSeatSnapshot(prisma, companyId, billingCheckoutBase());
    if (!snap) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(200).json(snap);
  });

  app.get("/org/invitations", orgAuth, async (req, res) => {
    const { companyId } = (req as AuthedRequest).auth;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { slug: true },
    });
    if (!company || isPlatformCompanySlug(company.slug)) {
      res.status(400).json({ error: "not_applicable" });
      return;
    }
    const now = new Date();
    const rows = await prisma.invitation.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        email: true,
        createdAt: true,
        expiresAt: true,
        acceptedAt: true,
      },
    });
    res.status(200).json({ invitations: rows, now: now.toISOString() });
  });

  app.post("/org/invitations", orgAuth, async (req, res) => {
    const parsed = orgInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const { companyId, userId } = (req as AuthedRequest).auth;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company || isPlatformCompanySlug(company.slug)) {
      res.status(400).json({ error: "not_applicable" });
      return;
    }

    const emails = [...new Set(parsed.data.emails.map((e) => e.trim().toLowerCase()))];
    const snap = await buildOrgSeatSnapshot(prisma, companyId, null);
    if (!snap) {
      res.status(500).json({ error: "server_error" });
      return;
    }
    if (emails.length > snap.seatsRemaining) {
      res.status(400).json({
        error: "insufficient_seats",
        seatsRemaining: snap.seatsRemaining,
        requested: emails.length,
      });
      return;
    }

    const results: {
      email: string;
      inviteUrl: string;
      error?: string;
      emailSent?: boolean;
      emailError?: string;
    }[] = [];
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    for (const email of emails) {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        if (existingUser.companyId === companyId) {
          results.push({ email, inviteUrl: "", error: "already_member" });
          continue;
        }
        results.push({ email, inviteUrl: "", error: "email_in_other_org" });
        continue;
      }

      const pendingSameEmail = await prisma.invitation.findFirst({
        where: {
          companyId,
          email,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (pendingSameEmail) {
        await prisma.invitation.delete({ where: { id: pendingSameEmail.id } });
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashInviteToken(rawToken);
      await prisma.invitation.create({
        data: {
          companyId,
          email,
          tokenHash,
          expiresAt,
          invitedById: userId,
        },
      });
      const inviteUrl = `${frontendBase()}/invite/accept?token=${encodeURIComponent(rawToken)}`;

      let emailSent = false;
      let emailError: string | undefined;
      if (isMailConfigured()) {
        const sent = await sendInvitationEmail({
          to: email,
          companyName: company.name,
          inviteUrl,
        });
        emailSent = sent.ok;
        if (!sent.ok && sent.error && sent.error !== "mail_not_configured") {
          emailError = sent.error;
        }
      }

      results.push({ email, inviteUrl, emailSent, ...(emailError ? { emailError } : {}) });
    }

    res.status(201).json({ results, mailConfigured: isMailConfigured() });
  });

  app.post("/platform/companies", superAuth, async (req, res) => {
    const parsed = platformCreateCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const { name, slug, adminEmail, adminPassword, seatLimit } = parsed.data;

    const slugTaken = await prisma.company.findUnique({ where: { slug } });
    if (slugTaken) {
      res.status(409).json({ error: "slug_taken" });
      return;
    }

    const emailTaken = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (emailTaken) {
      res.status(409).json({ error: "admin_email_in_use" });
      return;
    }

    const passwordHash = await hashPassword(adminPassword);
    const defaultScope = await getPlatformDefaultCompetitionScope(prisma);
    const result = await prisma.$transaction(async (tx) => {
      const comp = await tx.company.create({
        data: {
          name,
          slug,
          seatLimit,
        },
      });
      const adminUser = await tx.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          fullName: null,
          companyId: comp.id,
          role: "org_admin",
          status: "active",
        },
        select: { id: true, email: true, role: true, companyId: true },
      });
      await tx.companyConfig.create({
        data: {
          companyId: comp.id,
          anonymizationEnabled: true,
          competitionScope: defaultScope,
        },
      });
      return { company: comp, adminUser };
    });

    res.status(201).json({
      company: {
        id: result.company.id,
        name: result.company.name,
        slug: result.company.slug,
        seatLimit: result.company.seatLimit,
      },
      admin: result.adminUser,
    });
  });

  /** Resumen pool público + liga universal (super admin). */
  app.get("/platform/overview", superAuth, async (_req, res) => {
    const platform = await prisma.company.findUnique({
      where: { slug: "platform-internal" },
      select: { id: true, name: true },
    });
    if (!platform) {
      res.status(200).json({
        platformCompany: null,
        publicPoolUserCount: 0,
        universalLeague: null,
        pendingCompetitionInvites: 0,
        acceptedCompetitionInvites: 0,
      });
      return;
    }
    const now = new Date();
    const publicPoolUserCount = await prisma.user.count({
      where: {
        companyId: platform.id,
        status: "active",
        role: { not: "super_admin" },
      },
    });
    const universal = await prisma.competition.findFirst({
      where: { companyId: platform.id, slug: UNIVERSAL_COMPETITION_SLUG },
      include: { _count: { select: { members: true } } },
    });
    const [pendingCompetitionInvites, acceptedCompetitionInvites] = await Promise.all([
      prisma.competitionInvitation.count({
        where: { acceptedAt: null, expiresAt: { gt: now } },
      }),
      prisma.competitionInvitation.count({
        where: { acceptedAt: { not: null } },
      }),
    ]);
    res.status(200).json({
      platformCompany: { id: platform.id, name: platform.name },
      publicPoolUserCount,
      universalLeague: universal
        ? {
            id: universal.id,
            name: universal.name,
            slug: universal.slug,
            memberCount: universal._count.members,
          }
        : null,
      pendingCompetitionInvites,
      acceptedCompetitionInvites,
    });
  });

  /** Listado reciente de usuarios del pool público (sin invitación B2B). */
  app.get("/platform/public-pool-users", superAuth, async (req, res) => {
    const raw = req.query.limit;
    const parsed = raw !== undefined && raw !== "" ? parseInt(String(raw), 10) : 80;
    const limit = Math.min(200, Math.max(1, Number.isFinite(parsed) ? parsed : 80));
    const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const platform = await prisma.company.findUnique({
      where: { slug: "platform-internal" },
      select: { id: true },
    });
    if (!platform) {
      res.status(200).json({ users: [] });
      return;
    }
    const users = await prisma.user.findMany({
      where: {
        companyId: platform.id,
        role: { not: "super_admin" },
        status: "active",
        ...(qRaw.length > 0
          ? {
              OR: [
                { email: { contains: qRaw, mode: "insensitive" } },
                { fullName: { contains: qRaw, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.status(200).json({ users });
  });

  app.get("/platform/companies", superAuth, async (_req, res) => {
    const companies = await prisma.company.findMany({
      where: { NOT: { slug: "platform-internal" } },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            users: true,
            invitations: true,
            competitions: true,
          },
        },
      },
    });
    const companyIds = companies.map((c) => c.id);
    const configRows =
      companyIds.length === 0
        ? []
        : await prisma.companyConfig.findMany({
            where: { companyId: { in: companyIds } },
            select: { companyId: true, competitionScope: true },
          });
    const scopeByCompany = new Map(configRows.map((c) => [c.companyId, c.competitionScope]));
    const orgAdminRows =
      companyIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: {
              companyId: { in: companyIds },
              role: "org_admin",
              status: "active",
            },
            select: { id: true, email: true, companyId: true },
            orderBy: { createdAt: "asc" },
          });
    const orgAdminsByCompany = new Map<string, { id: string; email: string }[]>();
    for (const u of orgAdminRows) {
      const list = orgAdminsByCompany.get(u.companyId) ?? [];
      list.push({ id: u.id, email: u.email });
      orgAdminsByCompany.set(u.companyId, list);
    }
    res.status(200).json({
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        seatLimit: c.seatLimit,
        createdAt: c.createdAt,
        userCount: c._count.users,
        invitationCount: c._count.invitations,
        competitionCount: c._count.competitions,
        stripeCustomerId: c.stripeCustomerId,
        competitionScope: scopeByCompany.get(c.id) ?? "all",
        orgAdmins: orgAdminsByCompany.get(c.id) ?? [],
      })),
    });
  });

  app.get("/platform/settings", superAuth, async (_req, res) => {
    const defaultCompetitionScope = await getPlatformDefaultCompetitionScope(prisma);
    res.status(200).json({ defaultCompetitionScope });
  });

  app.patch("/platform/settings", superAuth, async (req, res) => {
    const parsed = platformSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const row = await prisma.platformConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        defaultCompetitionScope: parsed.data.defaultCompetitionScope,
      },
      update: { defaultCompetitionScope: parsed.data.defaultCompetitionScope },
    });
    res.status(200).json({ defaultCompetitionScope: row.defaultCompetitionScope });
  });

  /** Super admin: nueva contraseña para un usuario `org_admin` de una empresa (no plataforma). */
  app.post("/platform/org-admins/:userId/reset-password", superAuth, async (req, res) => {
    const userId = routeParamUserId(req);
    if (!userId) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const parsed = platformResetOrgAdminPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const target = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: { select: { id: true, slug: true } } },
    });
    if (
      !target ||
      target.role !== "org_admin" ||
      !target.company ||
      isPlatformCompanySlug(target.company.slug)
    ) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    res.status(200).json({ ok: true });
  });

  app.patch("/platform/companies/:id", superAuth, async (req, res) => {
    const id = routeParamId(req);
    if (!id) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const parsed = platformPatchCompanySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing || isPlatformCompanySlug(existing.slug)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const companyData: { seatLimit?: number; competitionLimit?: number | null } = {};
    if (parsed.data.seatLimit !== undefined) companyData.seatLimit = parsed.data.seatLimit;
    if (parsed.data.competitionLimit !== undefined) {
      companyData.competitionLimit = parsed.data.competitionLimit;
    }
    const updated =
      Object.keys(companyData).length > 0
        ? await prisma.company.update({
            where: { id },
            data: companyData,
            select: { id: true, name: true, slug: true, seatLimit: true, competitionLimit: true },
          })
        : await prisma.company.findUniqueOrThrow({
            where: { id },
            select: { id: true, name: true, slug: true, seatLimit: true, competitionLimit: true },
          });
    if (parsed.data.competitionScope !== undefined) {
      await prisma.companyConfig.upsert({
        where: { companyId: id },
        create: {
          companyId: id,
          competitionScope: parsed.data.competitionScope,
          anonymizationEnabled: true,
        },
        update: { competitionScope: parsed.data.competitionScope },
      });
    }
    const competitionScope = await resolveCompanyCompetitionScope(prisma, id, existing.slug);
    res.status(200).json({ company: { ...updated, competitionScope } });
  });

  /**
   * IA del pool público (misma tabla `AiConfig` que por empresa, companyId = platform-internal).
   * Sin esto, quienes no tienen org B2B dependen solo de OPENAI_API_KEY en env.
   */
  app.get("/platform/ai-config", superAuth, async (_req, res) => {
    const platform = await prisma.company.findUnique({ where: { slug: "platform-internal" } });
    if (!platform) {
      res.status(404).json({ error: "not_found", message: "Falta empresa platform-internal." });
      return;
    }
    const config = await prisma.aiConfig.findUnique({
      where: { companyId: platform.id },
    });
    if (!config) {
      res.status(200).json({ config: null });
      return;
    }
    res.status(200).json({
      config: {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        hasApiKey: Boolean(config.apiKeyEnc),
      },
    });
  });

  app.patch("/platform/ai-config", superAuth, async (req, res) => {
    const parsed = adminAiConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((e) => `${e.path.map(String).join(".")}: ${e.message}`).join("; ");
      res.status(400).json({ error: "invalid_body", message: msg });
      return;
    }
    const platform = await prisma.company.findUnique({ where: { slug: "platform-internal" } });
    if (!platform) {
      res.status(404).json({ error: "not_found", message: "Falta empresa platform-internal." });
      return;
    }
    const companyId = platform.id;
    const { provider, model, baseUrl, apiKey } = parsed.data;

    const data: {
      provider?: string;
      model?: string;
      baseUrl?: string | null;
      apiKeyEnc?: string | null;
    } = {};
    if (provider !== undefined) data.provider = provider;
    if (model !== undefined && model.trim()) data.model = model.trim();
    if (baseUrl !== undefined) data.baseUrl = (typeof baseUrl === "string" ? baseUrl.trim() : null) || null;
    if (apiKey !== undefined) {
      data.apiKeyEnc = apiKey.trim() ? encrypt(apiKey.trim()) : null;
    }

    const config = await prisma.aiConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        provider: data.provider ?? "openai",
        model: data.model ?? "gpt-4o-mini",
        baseUrl: data.baseUrl ?? null,
        apiKeyEnc: data.apiKeyEnc ?? null,
      },
      update: data,
    });

    res.status(200).json({
      config: {
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        hasApiKey: Boolean(config.apiKeyEnc),
      },
    });
  });
}
