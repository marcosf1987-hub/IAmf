import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import type { PrismaClient, UserRole } from "@prisma/client";
import { signAccessToken } from "./auth";
import { envString } from "./env-dynamic";
import { EK } from "./env-key-names";
import { ensureUniversalLeagueMembership } from "./universal-league";

const OAUTH_PROVIDER = "google" as const;
type OAuthProviderId = typeof OAUTH_PROVIDER;

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

function callbackUri(): string {
  return `${apiPublicBase()}/auth/oauth/google/callback`;
}

function redirectFrontend(res: Response, fragment: Record<string, string>): void {
  const q = new URLSearchParams(fragment).toString();
  res.redirect(302, `${frontendBase()}/oauth/callback#${q}`);
}

/** Quita BOM, espacios invisibles y bordes: evita que el secreto “parezca vacío” para el servidor. */
function normalizeEnvOAuth(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const t = raw.replace(/^\uFEFF/g, "").replace(/\u200B/g, "").trim();
  return t.length > 0 ? t : undefined;
}

function googleIdValue(): string | undefined {
  return normalizeEnvOAuth(envString(EK.googleId));
}

function googleSecretValue(): string | undefined {
  return normalizeEnvOAuth(envString(EK.googleSecret));
}

function googleConfigured(): boolean {
  return Boolean(googleIdValue() && googleSecretValue());
}

/** Sin valores secretos: ayuda a ver si el proceso ve las variables (p. ej. Railway vs .env). */
export function getOAuthConfigJson(): {
  google: boolean;
  googleClientIdSet: boolean;
  googleClientSecretSet: boolean;
  /** La clave existe en `process.env` (Railway la inyectó), aunque el valor sea "". */
  googleClientSecretEnvKeyPresent: boolean;
  /** Longitud del valor **después** de trim/BOM (no el secreto en sí). 0 = vacío o solo espacios. */
  googleClientSecretTrimmedLength: number;
} {
  const secretKey = EK.googleSecret;
  const rawSecret = process.env[secretKey];
  const googleClientSecretEnvKeyPresent = Object.hasOwn(process.env, secretKey);
  const trimmed = googleSecretValue();
  const googleClientSecretTrimmedLength = trimmed?.length ?? 0;
  const googleClientIdSet = Boolean(googleIdValue());
  const googleClientSecretSet = googleClientSecretTrimmedLength > 0;
  return {
    google: googleClientIdSet && googleClientSecretSet,
    googleClientIdSet,
    googleClientSecretSet,
    googleClientSecretEnvKeyPresent,
    googleClientSecretTrimmedLength,
  };
}

async function exchangeGoogleCode(code: string): Promise<{ access_token: string }> {
  const clientId = googleIdValue()!;
  const clientSecret = googleSecretValue()!;
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: callbackUri(),
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
    res.set("Vary", "Accept");
    res.status(200).json(getOAuthConfigJson());
  });

  app.get("/auth/oauth/google/start", (_req: Request, res: Response) => {
    const state = newState();
    if (!googleConfigured()) {
      res.status(503).json({ error: "oauth_not_configured", provider: "google" });
      return;
    }
    const clientId = googleIdValue()!;
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("redirect_uri", callbackUri());
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", "openid email profile");
    u.searchParams.set("state", state);
    u.searchParams.set("access_type", "online");
    u.searchParams.set("include_granted_scopes", "true");
    res.redirect(302, u.toString());
  });

  app.get("/auth/oauth/google/callback", async (req: Request, res: Response) => {
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
      const { access_token } = await exchangeGoogleCode(code);
      const prof = await fetchGoogleProfile(access_token);
      const user = await findOrCreateOAuthUser(prisma, OAUTH_PROVIDER, prof.sub, prof.email, prof.name ?? null);

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
