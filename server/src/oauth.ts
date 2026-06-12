import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import type { PrismaClient, UserRole } from "@prisma/client";
import { signAccessToken } from "./auth";
import { setSessionCookies } from "./session-cookie";
import { envString } from "./env-dynamic";
import { EK } from "./env-key-names";
import { ensureUniversalLeagueMembership } from "./universal-league";

const PROVIDER_GOOGLE = "google";

/**
 * Variables OAuth / front: leer con **nombre literal** en el bundle (bracket y dot).
 * Railpack/Railway a veces no inyecta claves que no aparecen en el JS compilado;
 * los nombres `EK` solos no alcanzaban.
 */
type OauthProcessEnv = NodeJS.ProcessEnv & {
  OAUTH_PUBLIC_BASE_URL?: string;
  OAUTH_GOOGLE_CLIENT_ID?: string;
  OAUTH_GOOGLE_CLIENT_SECRET?: string;
  FRONTEND_URL?: string;
  /** Alias opcional si en Railway usaste otro nombre (mismo valor: URL pública del API). */
  API_PUBLIC_BASE_URL?: string;
  PUBLIC_URL?: string;
  /** Alias opcional del secreto de cliente Google. */
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
};

function pe(): OauthProcessEnv {
  return process.env as OauthProcessEnv;
}

function readOauthPublicBase(): string {
  const v =
    pe().OAUTH_PUBLIC_BASE_URL?.trim() ||
    process.env["OAUTH_PUBLIC_BASE_URL"]?.trim() ||
    pe().API_PUBLIC_BASE_URL?.trim() ||
    process.env["API_PUBLIC_BASE_URL"]?.trim() ||
    pe().PUBLIC_URL?.trim() ||
    process.env["PUBLIC_URL"]?.trim() ||
    envString(EK.oauthPublicBase)?.trim() ||
    "";
  return v.replace(/\/+$/, "");
}

function readGoogleClientIdRaw(): string | undefined {
  return pe().OAUTH_GOOGLE_CLIENT_ID ?? process.env["OAUTH_GOOGLE_CLIENT_ID"] ?? envString(EK.googleId);
}

function readGoogleClientSecretRaw(): string | undefined {
  const a = pe().OAUTH_GOOGLE_CLIENT_SECRET?.trim();
  const b = process.env["OAUTH_GOOGLE_CLIENT_SECRET"]?.trim();
  const c = pe().GOOGLE_CLIENT_SECRET?.trim();
  const d = process.env["GOOGLE_CLIENT_SECRET"]?.trim();
  const e = pe().GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const f = process.env["GOOGLE_OAUTH_CLIENT_SECRET"]?.trim();
  const g = envString(EK.googleSecret)?.trim();
  return a || b || c || d || e || f || g || undefined;
}

function readFrontendUrlRaw(): string | undefined {
  return pe().FRONTEND_URL ?? process.env["FRONTEND_URL"] ?? envString(EK.frontend);
}

function parseCookie(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function frontendBase(): string {
  return (readFrontendUrlRaw()?.trim() || "http://localhost:5173").replace(/\/+$/, "");
}

function apiPublicBase(): string {
  return readOauthPublicBase();
}

function redirectUri(): string {
  const base = apiPublicBase();
  if (!base) return "";
  return `${base}/auth/oauth/google/callback`;
}

function normalizeClientId(raw: string | undefined): string {
  const t = raw?.trim() ?? "";
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function googleClientId(): string {
  return normalizeClientId(readGoogleClientIdRaw());
}

function googleClientSecret(): string {
  return (readGoogleClientSecretRaw() ?? "").trim();
}

const STATE_COOKIE = "pp_oauth_google_state";

function appendStateCookie(res: Response, state: string): void {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${STATE_COOKIE}=${encodeURIComponent(state)}`,
    "Path=/",
    "HttpOnly",
    "Max-Age=600",
    "SameSite=Lax",
  ];
  if (isProd) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function clearStateCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [`${STATE_COOKIE}=`, "Path=/", "HttpOnly", "Max-Age=0", "SameSite=Lax"];
  if (isProd) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function redirectFrontendError(res: Response, message: string): void {
  const q = new URLSearchParams({ oauth_error: message }).toString();
  res.redirect(302, `${frontendBase()}/oauth/callback?${q}`);
}

function redirectOAuthSuccess(res: Response, jwt: string): void {
  setSessionCookies(res, jwt);
  res.redirect(302, `${frontendBase()}/oauth/callback?oauth=success`);
}

type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

async function findOrCreateGoogleUser(
  prisma: PrismaClient,
  providerUserId: string,
  email: string,
  fullName: string | null,
  emailVerified: boolean
): Promise<{ id: string; role: UserRole; companyId: string; tokenVersion: number }> {
  if (!emailVerified || !email) {
    throw new Error("google_email_unverified");
  }

  const existingLink = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: { provider: PROVIDER_GOOGLE, providerUserId },
    },
    include: {
      user: { select: { id: true, role: true, companyId: true, status: true, tokenVersion: true } },
    },
  });
  if (existingLink?.user) {
    if (existingLink.user.status !== "active") throw new Error("user_disabled");
    return {
      id: existingLink.user.id,
      role: existingLink.user.role,
      companyId: existingLink.user.companyId,
      tokenVersion: existingLink.user.tokenVersion,
    };
  }

  const byEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, companyId: true, status: true, tokenVersion: true },
  });
  if (byEmail) {
    if (byEmail.status !== "active") throw new Error("user_disabled");
    await prisma.oAuthAccount.create({
      data: {
        provider: PROVIDER_GOOGLE,
        providerUserId,
        userId: byEmail.id,
      },
    });
    return {
      id: byEmail.id,
      role: byEmail.role,
      companyId: byEmail.companyId,
      tokenVersion: byEmail.tokenVersion,
    };
  }

  const platformCompany = await prisma.company.findUnique({
    where: { slug: "platform-internal" },
  });
  if (!platformCompany) throw new Error("platform_not_configured");

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      fullName,
      companyId: platformCompany.id,
      role: "member",
      status: "active",
      oauthAccounts: {
        create: { provider: PROVIDER_GOOGLE, providerUserId },
      },
    },
    select: { id: true, role: true, companyId: true, tokenVersion: true },
  });
  return user;
}

export function getOAuthConfigJson(): {
  google: boolean;
  googleClientIdSet: boolean;
  googleClientSecretSet: boolean;
  oauthPublicBaseSet: boolean;
  /** Solo para comprobar que el front llama al API actualizado (no secretos). */
  oauthConfigFormat: number;
} {
  const id = googleClientId();
  const secret = googleClientSecret();
  const base = apiPublicBase();
  const ready = Boolean(id && secret && base);
  return {
    google: ready,
    googleClientIdSet: Boolean(id),
    googleClientSecretSet: Boolean(secret),
    oauthPublicBaseSet: Boolean(base),
    oauthConfigFormat: 2,
  };
}

export function mountOAuthRoutes(app: Express, prisma: PrismaClient): void {
  app.get("/auth/oauth/config", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).json(getOAuthConfigJson());
  });

  app.get("/auth/oauth/google/start", (_req: Request, res: Response) => {
    const clientId = googleClientId();
    const secret = googleClientSecret();
    const redir = redirectUri();
    if (!clientId || !secret || !redir) {
      const missing: string[] = [];
      if (!apiPublicBase()) missing.push("OAUTH_PUBLIC_BASE_URL");
      if (!clientId) missing.push("OAUTH_GOOGLE_CLIENT_ID");
      if (!secret) missing.push("OAUTH_GOOGLE_CLIENT_SECRET");
      // eslint-disable-next-line no-console
      console.error("[oauth] Google OAuth no configurado. Variables faltantes:", missing.join(", "));
      res.status(503).json({
        error: "oauth_not_configured",
        provider: "google",
        oauthConfigFormat: 2,
      });
      return;
    }
    const state = randomBytes(24).toString("hex");
    appendStateCookie(res, state);
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("redirect_uri", redir);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", "openid email profile");
    u.searchParams.set("state", state);
    u.searchParams.set("prompt", "select_account");
    res.redirect(302, u.toString());
  });

  app.get("/auth/oauth/google/callback", async (req: Request, res: Response) => {
    const q = req.query as Record<string, string | undefined>;
    const err = q.error;
    if (err) {
      clearStateCookie(res);
      const desc = typeof q.error_description === "string" ? q.error_description : err;
      redirectFrontendError(res, desc || err);
      return;
    }
    const code = q.code;
    const state = q.state;
    const cookies = parseCookie(req.headers.cookie);
    if (!code || !state || cookies[STATE_COOKIE] !== state) {
      clearStateCookie(res);
      redirectFrontendError(res, "Sesión de inicio con Google inválida o expirada. Probá de nuevo.");
      return;
    }
    clearStateCookie(res);

    const clientId = googleClientId();
    const secret = googleClientSecret();
    const redir = redirectUri();
    if (!clientId || !secret || !redir) {
      redirectFrontendError(res, "oauth_not_configured");
      return;
    }

    try {
      const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: secret,
        redirect_uri: redir,
        grant_type: "authorization_code",
      });
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const tokenJson = (await tokenRes.json()) as GoogleTokenResponse;
      if (!tokenRes.ok || !tokenJson.access_token) {
        // eslint-disable-next-line no-console
        console.error("Google token error:", tokenJson);
        redirectFrontendError(
          res,
          tokenJson.error_description || tokenJson.error || "No se pudo validar la cuenta de Google."
        );
        return;
      }

      const uiRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const prof = (await uiRes.json()) as GoogleUserInfo;
      if (!uiRes.ok || !prof.sub || !prof.email) {
        redirectFrontendError(res, "No se pudo leer el perfil de Google.");
        return;
      }

      const userRow = await findOrCreateGoogleUser(
        prisma,
        prof.sub,
        prof.email,
        prof.name ?? null,
        Boolean(prof.email_verified)
      );

      try {
        await ensureUniversalLeagueMembership(prisma, userRow.id);
      } catch (leagueErr) {
        // eslint-disable-next-line no-console
        console.error("ensureUniversalLeagueMembership (oauth):", leagueErr);
      }

      await prisma.loginEvent.create({
        data: {
          userId: userRow.id,
          ip: req.ip,
          userAgent: req.header("user-agent") ?? null,
        },
      });

      const token = signAccessToken({
        userId: userRow.id,
        role: userRow.role,
        companyId: userRow.companyId,
        tokenVersion: userRow.tokenVersion,
      });
      redirectOAuthSuccess(res, token);
    } catch (e) {
      const codeMsg =
        e instanceof Error
          ? e.message === "google_email_unverified"
            ? "Tu cuenta de Google no tiene el email verificado. Verificá el email en Google e intentá de nuevo."
            : e.message === "user_disabled"
              ? "Esta cuenta está deshabilitada."
              : e.message === "platform_not_configured"
                ? "La plataforma no está lista (falta empresa interna). Contactá soporte."
                : e.message
          : String(e);
      // eslint-disable-next-line no-console
      console.error("OAuth Google callback:", e);
      redirectFrontendError(res, codeMsg);
    }
  });

  const snap = getOAuthConfigJson();
  if (!snap.google) {
    // eslint-disable-next-line no-console
    console.warn("[oauth] Google OAuth no operativo al arrancar (flags sin secretos):", snap);
  }
}
