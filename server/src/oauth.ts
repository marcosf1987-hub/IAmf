import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import type { PrismaClient, UserRole } from "@prisma/client";
import { signAccessToken } from "./auth";
import { envString } from "./env-dynamic";
import { EK } from "./env-key-names";
import { ensureUniversalLeagueMembership } from "./universal-league";

export type OAuthProviderId = "google" | "facebook" | "microsoft";

const STATE_TTL_MS = 10 * 60 * 1000;
const stateStore = new Map<string, number>();

function cleanupStates(): void {
  const now = Date.now();
  for (const [k, exp] of stateStore) {
    if (exp < now) stateStore.delete(k);
  }
}

function newState(): string {
  cleanupStates();
  const s = crypto.randomBytes(24).toString("hex");
  stateStore.set(s, Date.now() + STATE_TTL_MS);
  return s;
}

function consumeState(s: string | undefined): boolean {
  if (!s) return false;
  cleanupStates();
  const exp = stateStore.get(s);
  if (!exp || exp < Date.now()) return false;
  stateStore.delete(s);
  return true;
}

function apiPublicBase(): string {
  const raw = envString(EK.oauthPublicBase)?.trim() || envString(EK.publicApi)?.trim();
  return (raw || "http://localhost:4000").replace(/\/+$/, "");
}

function frontendBase(): string {
  return (envString(EK.frontend)?.trim() || "http://localhost:5173").replace(/\/+$/, "");
}

function callbackUri(provider: OAuthProviderId): string {
  return `${apiPublicBase()}/auth/oauth/${provider}/callback`;
}

function redirectFrontend(res: Response, fragment: Record<string, string>): void {
  const q = new URLSearchParams(fragment).toString();
  res.redirect(302, `${frontendBase()}/oauth/callback#${q}`);
}

function isProvider(s: string): s is OAuthProviderId {
  return s === "google" || s === "facebook" || s === "microsoft";
}

function googleConfigured(): boolean {
  return Boolean(envString(EK.googleId)?.trim() && envString(EK.googleSecret)?.trim());
}

function facebookConfigured(): boolean {
  return Boolean(envString(EK.fbId)?.trim() && envString(EK.fbSecret)?.trim());
}

function microsoftConfigured(): boolean {
  return Boolean(envString(EK.msId)?.trim() && envString(EK.msSecret)?.trim());
}

export function getOAuthConfigJson(): { google: boolean; facebook: boolean; microsoft: boolean } {
  return {
    google: googleConfigured(),
    facebook: facebookConfigured(),
    microsoft: microsoftConfigured(),
  };
}

async function exchangeGoogleCode(code: string): Promise<{ access_token: string }> {
  const clientId = envString(EK.googleId)!.trim();
  const clientSecret = envString(EK.googleSecret)!.trim();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUri("google"),
    grant_type: "authorization_code",
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Google token: ${r.status} ${t}`);
  }
  return r.json() as Promise<{ access_token: string }>;
}

async function fetchGoogleProfile(accessToken: string): Promise<{ sub: string; email: string; name?: string }> {
  const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`Google userinfo: ${r.status}`);
  const j = (await r.json()) as { sub: string; email?: string; name?: string };
  if (!j.email) throw new Error("Google no devolvió email");
  return { sub: j.sub, email: j.email, name: j.name };
}

async function exchangeFacebookCode(code: string): Promise<{ access_token: string }> {
  const appId = envString(EK.fbId)!.trim();
  const secret = envString(EK.fbSecret)!.trim();
  const url = new URL(`https://graph.facebook.com/v21.0/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("redirect_uri", callbackUri("facebook"));
  url.searchParams.set("code", code);
  const r = await fetch(url.toString());
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Facebook token: ${r.status} ${t}`);
  }
  return r.json() as Promise<{ access_token: string }>;
}

async function fetchFacebookProfile(
  accessToken: string
): Promise<{ id: string; email: string; name?: string }> {
  const url = new URL("https://graph.facebook.com/v21.0/me");
  url.searchParams.set("fields", "id,name,email");
  url.searchParams.set("access_token", accessToken);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Facebook me: ${r.status}`);
  const j = (await r.json()) as { id: string; name?: string; email?: string };
  if (!j.email) throw new Error("Facebook no devolvió email (revisa permisos de la app)");
  return { id: j.id, email: j.email, name: j.name };
}

async function exchangeMicrosoftCode(code: string): Promise<{ access_token: string }> {
  const clientId = envString(EK.msId)!.trim();
  const clientSecret = envString(EK.msSecret)!.trim();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callbackUri("microsoft"),
    grant_type: "authorization_code",
  });
  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Microsoft token: ${r.status} ${t}`);
  }
  return r.json() as Promise<{ access_token: string }>;
}

async function fetchMicrosoftProfile(
  accessToken: string
): Promise<{ id: string; email: string; name?: string }> {
  const r = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`Microsoft me: ${r.status}`);
  const j = (await r.json()) as {
    id: string;
    displayName?: string;
    mail?: string | null;
    userPrincipalName?: string | null;
  };
  const email = (j.mail || j.userPrincipalName || "").trim();
  if (!email) throw new Error("Microsoft no devolvió email");
  return { id: j.id, email, name: j.displayName };
}

async function findOrCreateOAuthUser(
  prisma: PrismaClient,
  provider: OAuthProviderId,
  providerUserId: string,
  email: string,
  fullName: string | null
): Promise<{ id: string; email: string; fullName: string | null; role: UserRole; companyId: string }> {
  const existingLink = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId } },
    include: { user: true },
  });
  if (existingLink) {
    if (existingLink.user.status !== "active") {
      throw new Error("Cuenta deshabilitada");
    }
    const u = existingLink.user;
    return { id: u.id, email: u.email, fullName: u.fullName, role: u.role, companyId: u.companyId };
  }

  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    if (byEmail.status !== "active") {
      throw new Error("Cuenta deshabilitada");
    }
    await prisma.oAuthAccount.upsert({
      where: { provider_providerUserId: { provider, providerUserId } },
      create: { provider, providerUserId, userId: byEmail.id },
      update: {},
    });
    return {
      id: byEmail.id,
      email: byEmail.email,
      fullName: byEmail.fullName,
      role: byEmail.role,
      companyId: byEmail.companyId,
    };
  }

  const platformCompany = await prisma.company.findUnique({
    where: { slug: "platform-internal" },
  });
  if (!platformCompany) {
    throw new Error(
      "Falta la empresa plataforma (platform-internal). Ejecutá prisma db seed en el servidor."
    );
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      fullName,
      companyId: platformCompany.id,
      role: "member",
      status: "active",
      oauthAccounts: { create: { provider, providerUserId } },
    },
    select: { id: true, email: true, fullName: true, role: true, companyId: true },
  });
  try {
    await ensureUniversalLeagueMembership(prisma, user.id);
  } catch (leagueErr) {
    // eslint-disable-next-line no-console
    console.error("ensureUniversalLeagueMembership (oauth):", leagueErr);
  }
  return user;
}

export function mountOAuthRoutes(app: Express, prisma: PrismaClient): void {
  app.get("/auth/oauth/config", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.status(200).json(getOAuthConfigJson());
  });

  app.get("/auth/oauth/:provider/start", (req: Request, res: Response) => {
    const p = String(req.params.provider);
    if (!isProvider(p)) {
      res.status(404).json({ error: "unknown_provider" });
      return;
    }
    const state = newState();
    if (p === "google") {
      if (!googleConfigured()) {
        res.status(503).json({ error: "oauth_not_configured", provider: "google" });
        return;
      }
      const clientId = envString(EK.googleId)!.trim();
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      u.searchParams.set("client_id", clientId);
      u.searchParams.set("redirect_uri", callbackUri("google"));
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", "openid email profile");
      u.searchParams.set("state", state);
      u.searchParams.set("access_type", "online");
      u.searchParams.set("include_granted_scopes", "true");
      res.redirect(302, u.toString());
      return;
    }
    if (p === "facebook") {
      if (!facebookConfigured()) {
        res.status(503).json({ error: "oauth_not_configured", provider: "facebook" });
        return;
      }
      const appId = envString(EK.fbId)!.trim();
      const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
      u.searchParams.set("client_id", appId);
      u.searchParams.set("redirect_uri", callbackUri("facebook"));
      u.searchParams.set("state", state);
      u.searchParams.set("scope", "email,public_profile");
      res.redirect(302, u.toString());
      return;
    }
    if (!microsoftConfigured()) {
      res.status(503).json({ error: "oauth_not_configured", provider: "microsoft" });
      return;
    }
    const msClientId = envString(EK.msId)!.trim();
    const u = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    u.searchParams.set("client_id", msClientId);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", callbackUri("microsoft"));
    u.searchParams.set("response_mode", "query");
    u.searchParams.set("scope", "openid profile email offline_access");
    u.searchParams.set("state", state);
    res.redirect(302, u.toString());
  });

  app.get("/auth/oauth/:provider/callback", async (req: Request, res: Response) => {
    const p = String(req.params.provider);
    if (!isProvider(p)) {
      redirectFrontend(res, { error: "Proveedor desconocido" });
      return;
    }
    const err = typeof req.query.error === "string" ? req.query.error : undefined;
    const errDesc = typeof req.query.error_description === "string" ? req.query.error_description : "";
    if (err) {
      redirectFrontend(res, { error: errDesc || err || "oauth_denied" });
      return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code || !consumeState(state)) {
      redirectFrontend(res, { error: "Sesión OAuth inválida o expirada. Intentá de nuevo." });
      return;
    }

    try {
      let providerUserId: string;
      let email: string;
      let name: string | null = null;

      if (p === "google") {
        const { access_token } = await exchangeGoogleCode(code);
        const prof = await fetchGoogleProfile(access_token);
        providerUserId = prof.sub;
        email = prof.email;
        name = prof.name ?? null;
      } else if (p === "facebook") {
        const { access_token } = await exchangeFacebookCode(code);
        const prof = await fetchFacebookProfile(access_token);
        providerUserId = prof.id;
        email = prof.email;
        name = prof.name ?? null;
      } else {
        const { access_token } = await exchangeMicrosoftCode(code);
        const prof = await fetchMicrosoftProfile(access_token);
        providerUserId = prof.id;
        email = prof.email;
        name = prof.name ?? null;
      }

      const user = await findOrCreateOAuthUser(prisma, p, providerUserId, email, name);

      await prisma.loginEvent.create({
        data: {
          userId: user.id,
          ip: req.ip,
          userAgent: req.header("user-agent") ?? null,
        },
      });

      const token = signAccessToken({
        userId: user.id,
        role: user.role,
        companyId: user.companyId,
      });
      redirectFrontend(res, { token });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error OAuth";
      redirectFrontend(res, { error: msg });
    }
  });
}
