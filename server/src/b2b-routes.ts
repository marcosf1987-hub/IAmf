import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
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
  platformTransferUserSchema,
  platformUserHiddenFromRankingsSchema,
} from "./validators";
import {
  getPlatformDefaultCompetitionScope,
  resolveCompanyCompetitionScope,
} from "./company-competition-scope";
import { encrypt } from "./crypto-util";
import { buildMeResponse } from "./me-response";
import { buildOrgSeatSnapshot, isPlatformCompanySlug } from "./org-seat";
import { buildSystemHealth } from "./system-health";
import { setSessionCookies } from "./session-cookie";
import { buildPlatformOverview, loadPlatformUserMetrics } from "./platform-metrics";
import { buildPlatformAiHealth } from "./platform-ai-health";
import { parseAdminDateRangeQuery } from "./admin-date-range";
import { recordUserSession } from "./login-event";
import { isMailConfigured, sendInvitationEmail } from "./mail";
import { envString } from "./env-dynamic";
import { EK } from "./env-key-names";
import { replyGenericInviteError } from "./invite-security";
import { getFootballDataSyncStatus, runFootballDataMatchSync } from "./sync-match-results";
import {
  ensureCompanyUniversalLeagueMembership,
  ensureCompanyUniversalLeagues,
  removePlatformUniversalLeagueMembership,
} from "./universal-league";

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

    if (!isPlatformCompanySlug(company.slug)) {
      try {
        await ensureCompanyUniversalLeagueMembership(prisma, user.id);
      } catch (e) {
        console.error("ensureCompanyUniversalLeagueMembership (invite accept):", e);
      }
    }

    await recordUserSession(prisma, user.id, {
      ip: req.ip,
      userAgent: req.header("user-agent") ?? null,
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

    try {
      await ensureCompanyUniversalLeagues(prisma, result.company.id, result.adminUser.id);
    } catch (e) {
      console.error("ensureCompanyUniversalLeagues (create company):", e);
    }

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

  /** Diagnóstico operativo (solo super admin). */
  app.get("/health/system", superAuth, async (_req, res) => {
    try {
      const payload = await buildSystemHealth(prisma);
      res.status(200).json(payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("GET /health/system:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  /** Resumen pool público + liga universal (super admin). Query opcional from/to (YYYY-MM-DD). */
  app.get("/platform/overview", superAuth, async (req, res) => {
    const rangeParsed = parseAdminDateRangeQuery(req);
    if (!rangeParsed.ok) {
      res.status(400).json({ error: "invalid_query", message: rangeParsed.message });
      return;
    }
    const overview = await buildPlatformOverview(prisma, rangeParsed.range);
    res.status(200).json(overview);
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

  /** Todos los usuarios de la plataforma (super admin), con empresa y métricas de uso. */
  app.get("/platform/users", superAuth, async (req, res) => {
    const rangeParsed = parseAdminDateRangeQuery(req);
    if (!rangeParsed.ok) {
      res.status(400).json({ error: "invalid_query", message: rangeParsed.message });
      return;
    }

    const rawLimit = req.query.limit;
    const parsedLimit = rawLimit !== undefined && rawLimit !== "" ? parseInt(String(rawLimit), 10) : 80;
    const limit = Math.min(200, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 80));
    const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const companyRaw = typeof req.query.company === "string" ? req.query.company.trim() : "";

    const where: Prisma.UserWhereInput = {
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

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          hiddenFromRankings: true,
          createdAt: true,
          company: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ]);

    const userIds = users.map((u) => u.id);
    const metricsByUser = await loadPlatformUserMetrics(prisma, userIds, rangeParsed.range);

    const rows = users.map((u) => {
      const metrics = metricsByUser.get(u.id) ?? {
        sessionCount: 0,
        prodePrompts: 0,
        totalPrompts: 0,
        footballPredictions: 0,
        f1Predictions: 0,
        hasGuidelines: false,
        lastActivityAt: null,
      };
      return {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        status: u.status,
        hiddenFromRankings: u.hiddenFromRankings,
        createdAt: u.createdAt,
        company: u.company,
        ...metrics,
      };
    });

    res.status(200).json({
      users: rows,
      total,
      range: rangeParsed.range
        ? {
            from: rangeParsed.range.from.toISOString().slice(0, 10),
            to: rangeParsed.range.to.toISOString().slice(0, 10),
          }
        : null,
    });
  });

  app.get("/platform/ai-health", superAuth, async (req, res) => {
    const rangeParsed = parseAdminDateRangeQuery(req);
    if (!rangeParsed.ok) {
      res.status(400).json({ error: "invalid_query", message: rangeParsed.message });
      return;
    }
    const payload = await buildPlatformAiHealth(prisma, rangeParsed.range);
    res.status(200).json(payload);
  });

  app.patch("/platform/users/:userId/hidden-from-rankings", superAuth, async (req, res) => {
    const userId = routeParamUserId(req);
    if (!userId) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const parsed = platformUserHiddenFromRankingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!existing || existing.role === "super_admin") {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { hiddenFromRankings: parsed.data.hidden },
      select: {
        id: true,
        email: true,
        hiddenFromRankings: true,
      },
    });
    res.status(200).json({ ok: true, user });
  });

  app.delete("/platform/users/:userId", superAuth, async (req, res) => {
    const userId = routeParamUserId(req);
    if (!userId) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true },
    });
    if (!existing || existing.role === "super_admin") {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    await prisma.user.delete({ where: { id: userId } });
    res.status(200).json({ ok: true, deletedUserId: userId, email: existing.email });
  });

  /** Mover usuario del pool público (platform-internal) a una empresa B2B como member. */
  app.patch("/platform/users/:userId/company", superAuth, async (req, res) => {
    const userId = routeParamUserId(req);
    if (!userId) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const parsed = platformTransferUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const { companyId: targetCompanyId } = parsed.data;

    const targetCompany = await prisma.company.findUnique({
      where: { id: targetCompanyId },
      select: { id: true, name: true, slug: true, seatLimit: true },
    });
    if (!targetCompany || isPlatformCompanySlug(targetCompany.slug)) {
      res.status(400).json({ error: "invalid_target" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: { select: { id: true, slug: true } } },
    });
    if (
      !user ||
      user.status !== "active" ||
      user.role === "super_admin" ||
      !user.company ||
      !isPlatformCompanySlug(user.company.slug)
    ) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const activeSeats = await prisma.user.count({
      where: {
        companyId: targetCompany.id,
        status: "active",
        role: { in: ["org_admin", "member"] },
      },
    });
    if (activeSeats >= targetCompany.seatLimit) {
      res.status(403).json({ error: "seats_exceeded" });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      await removePlatformUniversalLeagueMembership(tx, userId);
      return tx.user.update({
        where: { id: userId },
        data: {
          companyId: targetCompany.id,
          role: "member",
          tokenVersion: { increment: 1 },
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          companyId: true,
        },
      });
    });

    try {
      await ensureCompanyUniversalLeagueMembership(prisma, userId);
    } catch (e) {
      console.error("ensureCompanyUniversalLeagueMembership (transfer):", e);
    }

    res.status(200).json({
      ok: true,
      user: {
        ...updated,
        company: {
          id: targetCompany.id,
          name: targetCompany.name,
          slug: targetCompany.slug,
        },
      },
    });
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
      // eslint-disable-next-line no-console
      console.error("Platform route: falta empresa platform-internal");
      res.status(404).json({ error: "platform_not_configured" });
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
      // eslint-disable-next-line no-console
      console.error("Platform route: falta empresa platform-internal");
      res.status(404).json({ error: "platform_not_configured" });
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

  app.get("/platform/match-results-sync-status", superAuth, async (_req, res) => {
    try {
      const status = await getFootballDataSyncStatus(prisma);
      res.status(200).json(status);
    } catch (err) {
      console.error("GET /platform/match-results-sync-status error:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/platform/sync-match-results", superAuth, async (req, res) => {
    const fullScanRaw = req.body?.fullScan;
    const fullScan = fullScanRaw === undefined ? true : Boolean(fullScanRaw);

    try {
      const result = await runFootballDataMatchSync(prisma, { fullScan });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof Error && (err as Error & { code?: string }).code === "missing_config") {
        res.status(400).json({
          error: "missing_config",
          message:
            "Agrega FOOTBALL_DATA_API_KEY en Railway (servicio backend). Obtén una gratis en https://www.football-data.org/",
        });
        return;
      }
      console.error("POST /platform/sync-match-results error:", err);
      const message = err instanceof Error ? err.message : "sync_error";
      res.status(500).json({ error: "sync_error", message });
    }
  });
}
