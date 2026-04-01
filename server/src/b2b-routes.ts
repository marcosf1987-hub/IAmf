import crypto from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { signAccessToken, verifyAccessToken, type AuthedRequest } from "./auth";
import { hashPassword } from "./password";
import {
  inviteAcceptSchema,
  orgInviteSchema,
  platformCreateCompanySchema,
  platformPatchCompanySchema,
  platformResetOrgAdminPasswordSchema,
} from "./validators";
import { buildOrgSeatSnapshot, isPlatformCompanySlug } from "./org-seat";
import { isMailConfigured, sendInvitationEmail } from "./mail";

function frontendBase(): string {
  return (process.env.FRONTEND_URL?.trim() || "http://localhost:5173").replace(/\/+$/, "");
}

function billingCheckoutBase(): string | null {
  const u = process.env.BILLING_CHECKOUT_BASE_URL?.trim();
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
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
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
      select: { id: true, role: true, companyId: true, status: true },
    });
    if (!user || user.status !== "active" || user.role !== "super_admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    (req as AuthedRequest).auth = {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
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
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
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
      select: { id: true, role: true, companyId: true, status: true },
    });
    if (!user || user.status !== "active" || user.role !== "org_admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    (req as AuthedRequest).auth = {
      userId: user.id,
      role: user.role,
      companyId: user.companyId,
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
        select: { id: true, email: true, fullName: true, role: true, companyId: true },
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
    });
    res.status(201).json({ token: access, user });
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
        data: { companyId: comp.id, anonymizationEnabled: true },
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

  app.get("/platform/companies", superAuth, async (_req, res) => {
    const companies = await prisma.company.findMany({
      where: { NOT: { slug: "platform-internal" } },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            users: true,
            invitations: true,
          },
        },
      },
    });
    const companyIds = companies.map((c) => c.id);
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
        stripeCustomerId: c.stripeCustomerId,
        orgAdmins: orgAdminsByCompany.get(c.id) ?? [],
      })),
    });
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
      data: { passwordHash },
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
    const updated = await prisma.company.update({
      where: { id },
      data: { seatLimit: parsed.data.seatLimit },
      select: { id: true, name: true, slug: true, seatLimit: true },
    });
    res.status(200).json({ company: updated });
  });
}
