import { formatApiError } from "./user-friendly-error";

export { formatApiError };

/**
 * URL base del backend (sin barra final).
 * Si VITE_API_URL no tiene `https://`, el navegador lo interpreta como RUTA del sitio actual
 * (ej. frontend.up.railway.app/iamf-production.../auth/login) y el login falla.
 */
function resolveApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();

  if (import.meta.env.DEV && !fromEnv) {
    return "/api";
  }

  const fallback = "http://localhost:4000";
  let base = (fromEnv || fallback).replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(base)) {
    const isLocal =
      base.startsWith("localhost") ||
      base.startsWith("127.0.0.1") ||
      base.startsWith("[::1]");
    base = `${isLocal ? "http" : "https"}://${base}`;
  }

  if (import.meta.env.PROD && !fromEnv) {
    // eslint-disable-next-line no-console
    console.error(
      "[Promptplay] Falta VITE_API_URL en el build. En Railway: Variables del servicio frontend → VITE_API_URL = https://tu-backend.up.railway.app (sin / al final) → Redeploy."
    );
  }

  return base;
}

export type OAuthProviderId = "google" | "facebook" | "microsoft";

/** URL absoluta para abrir el flujo OAuth (mismo host que el API). */
export function oauthStartUrl(provider: OAuthProviderId): string {
  return `${resolveApiBase()}/auth/oauth/${provider}/start`;
}

/** Indica qué proveedores tienen variables configuradas en el servidor. */
export async function fetchOAuthConfig(): Promise<{
  google: boolean;
  facebook: boolean;
  microsoft: boolean;
}> {
  const url = `${resolveApiBase()}/auth/oauth/config`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { google: false, facebook: false, microsoft: false };
    return (await res.json()) as {
      google: boolean;
      facebook: boolean;
      microsoft: boolean;
    };
  } catch {
    return { google: false, facebook: false, microsoft: false };
  }
}

const API_BASE = resolveApiBase();

/** True si el build de producción no incluyó la URL del API (el login fallará). */
export const isProductionApiUrlMissing =
  import.meta.env.PROD && !import.meta.env.VITE_API_URL;

const TOKEN_KEY = "rrhhia_token";

function networkHint(err: unknown): Error {
  if (err instanceof TypeError) {
    return new Error(
      import.meta.env.PROD
        ? "No se pudo conectar con el servidor. Revisá tu conexión o la configuración de la app."
        : "No se pudo conectar con el servidor. Si estás en la web publicada: en Railway agrega la variable VITE_API_URL con la URL https del backend (sin barra al final) y vuelve a desplegar el frontend."
    );
  }
  return new Error(formatApiError(err instanceof Error ? err : new Error(String(err))));
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function parseJson<T>(res: Response, url?: string): Promise<T> {
  const text = await res.text();
  if (text.startsWith("<")) {
    const hint = url
      ? `La API en ${url} devolvió HTML. ¿El backend está corriendo?`
      : "La API devolvió HTML en lugar de JSON. ¿El backend está corriendo en http://localhost:4000?";
    throw new Error(formatApiError(new Error(hint)));
  }
  try {
    return text ? JSON.parse(text) : ({} as T);
  } catch {
    throw new Error(formatApiError(new Error("Respuesta inválida de la API")));
  }
}

async function fetchAuth<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  if (!token) throw new Error(formatApiError(new Error("Unauthorized")));
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await parseJson<T & { message?: string }>(res, url);
  if (!res.ok) {
    const msg = (data as { message?: string; error?: string }).message
      ?? (data as { error?: string }).error
      ?? "Request failed";
    throw new Error(formatApiError(new Error(msg)));
  }
  return data;
}

export type Match = {
  id: string;
  stage: string;
  /** A–L en fase de grupos; null/omitido en eliminatorias o datos antiguos */
  groupCode?: string | null;
  teamA: string;
  teamB: string;
  kickoffAt: string;
  resultScoreA: number | null;
  resultScoreB: number | null;
};

export type Prediction = {
  id: string;
  matchId: string;
  scoreA: number;
  scoreB: number;
  createdAt: string;
  match?: Match;
};

export type UserRole = "super_admin" | "org_admin" | "member";

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  seatLimit: number;
};

export type OrgUsage = {
  seatLimit: number;
  activeUsers: number;
  invitationsPending: number;
  invitationsAccepted: number;
  invitationsTotal: number;
  seatsRemaining: number;
  billingCheckoutUrl: string | null;
};

export type User = {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  companyId: string;
  status?: string;
  createdAt?: string;
};

export type MeResponse = {
  user: User;
  company: CompanySummary | null;
  usage: OrgUsage | null;
};

export type LoginResponse = MeResponse & { token: string };

export type SignupResponse = LoginResponse;

export async function login(email: string, password: string): Promise<LoginResponse> {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await parseJson<LoginResponse & { error?: string; message?: string }>(
      res,
      `${API_BASE}/auth/login`
    );
    if (!res.ok) {
      const d = data as { error?: string; message?: string };
      throw new Error(d.message ?? d.error ?? `Error ${res.status}`);
    }
    return data as LoginResponse;
  } catch (e) {
    throw networkHint(e);
  }
}

export async function signup(
  email: string,
  password: string,
  fullName?: string
): Promise<SignupResponse> {
  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName }),
    });
    const data = await parseJson<SignupResponse & { error?: string }>(res, `${API_BASE}/auth/signup`);
    if (!res.ok) throw new Error(data.error ?? "Signup failed");
    return data as SignupResponse;
  } catch (e) {
    throw networkHint(e);
  }
}

export async function fetchMe(token?: string): Promise<MeResponse> {
  if (token) {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await parseJson<MeResponse & { error?: string }>(res);
    if (!res.ok) throw new Error(data.error ?? "Unauthorized");
    return data;
  }
  return fetchAuth("/me");
}

export async function updateMe(data: { fullName?: string; password?: string }): Promise<MeResponse> {
  return fetchAuth("/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function fetchOrgUsage(): Promise<OrgUsage> {
  return fetchAuth("/org/usage");
}

export type OrgInvitationRow = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
};

export async function fetchOrgInvitations(): Promise<{ invitations: OrgInvitationRow[] }> {
  return fetchAuth("/org/invitations");
}

export type OrgInviteResult = {
  email: string;
  inviteUrl: string;
  error?: string;
  emailSent?: boolean;
  emailError?: string;
};

export async function postOrgInvitations(emails: string[]): Promise<{
  results: OrgInviteResult[];
  mailConfigured: boolean;
}> {
  return fetchAuth("/org/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emails }),
  });
}

export async function fetchInvitePreview(token: string): Promise<{
  companyName: string;
  companySlug: string;
  email: string;
}> {
  const url = `${API_BASE}/auth/invite/preview?token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await parseJson<{ companyName: string; companySlug: string; email: string; error?: string }>(
    res,
    url
  );
  if (!res.ok) {
    throw new Error(data.error ?? "Invitación no válida");
  }
  return data;
}

export async function acceptInvite(
  token: string,
  password: string,
  fullName?: string
): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/auth/invite/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password, fullName }),
  });
  const data = await parseJson<{ token: string; user: User; error?: string }>(res, `${API_BASE}/auth/invite/accept`);
  if (!res.ok) throw new Error(data.error ?? "No se pudo aceptar la invitación");
  return data;
}

export type PlatformOrgAdminRef = {
  id: string;
  email: string;
};

export type PlatformCompanyRow = {
  id: string;
  name: string;
  slug: string;
  seatLimit: number;
  createdAt: string;
  userCount: number;
  invitationCount: number;
  /** Ligas/competencias creadas bajo esta empresa */
  competitionCount?: number;
  stripeCustomerId: string | null;
  orgAdmins: PlatformOrgAdminRef[];
};

export type PlatformOverview = {
  platformCompany: { id: string; name: string } | null;
  /** Usuarios activos en org platform-internal (público + OAuth), sin super_admin */
  publicPoolUserCount: number;
  universalLeague: {
    id: string;
    name: string;
    slug: string;
    memberCount: number;
  } | null;
  /** Invitaciones por email a ligas pendientes (no vencidas) */
  pendingCompetitionInvites: number;
  /** Invitaciones a ligas ya aceptadas (histórico) */
  acceptedCompetitionInvites: number;
};

export type PlatformPublicPoolUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  createdAt: string;
};

export async function fetchPlatformOverview(): Promise<PlatformOverview> {
  return fetchAuth("/platform/overview");
}

export async function fetchPlatformPublicPoolUsers(
  limit = 80,
  q?: string
): Promise<{ users: PlatformPublicPoolUser[] }> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (q?.trim()) qs.set("q", q.trim());
  return fetchAuth(`/platform/public-pool-users?${qs.toString()}`);
}

export async function fetchPlatformCompanies(): Promise<{ companies: PlatformCompanyRow[] }> {
  return fetchAuth("/platform/companies");
}

export async function createPlatformCompany(body: {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  seatLimit?: number;
}): Promise<{
  company: { id: string; name: string; slug: string; seatLimit: number };
  admin: { id: string; email: string; role: string; companyId: string };
}> {
  return fetchAuth("/platform/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchPlatformCompanySeat(
  companyId: string,
  seatLimit: number
): Promise<{ company: { id: string; name: string; slug: string; seatLimit: number } }> {
  return fetchAuth(`/platform/companies/${companyId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seatLimit }),
  });
}

export async function resetPlatformOrgAdminPassword(
  userId: string,
  newPassword: string
): Promise<{ ok: boolean }> {
  return fetchAuth(`/platform/org-admins/${userId}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });
}

/** IA del pool público (empresa `platform-internal`); solo `super_admin`. */
export async function fetchPlatformAiConfig(): Promise<{ config: AiConfig | null }> {
  return fetchAuth("/platform/ai-config");
}

export async function updatePlatformAiConfig(data: {
  provider?: "openai" | "custom" | "gemini" | "grok" | "groq" | "ollama";
  model?: string;
  baseUrl?: string | null;
  apiKey?: string;
}): Promise<{ config: AiConfig }> {
  return fetchAuth("/platform/ai-config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function fetchMatches(): Promise<{ matches: Match[] }> {
  return fetchAuth("/matches");
}

/** Próximos partidos futuros (endpoint público; no requiere token). */
export async function fetchPublicUpcomingMatches(limit = 5): Promise<{ matches: Match[] }> {
  const url = `${API_BASE}/public/upcoming-matches?limit=${encodeURIComponent(String(limit))}`;
  try {
    const res = await fetch(url);
    const data = await parseJson<{ matches: Match[] } & { error?: string }>(res, url);
    if (!res.ok) {
      throw new Error(data.error ?? "Request failed");
    }
    return data;
  } catch (e) {
    throw networkHint(e);
  }
}

export async function fetchMyPredictions(): Promise<{ predictions: Prediction[] }> {
  return fetchAuth("/predictions/me");
}

/** Historial de cambios de predicciones (solo del usuario autenticado; servidor) */
export type PredictionHistoryEntry = {
  id: string;
  createdAt: string;
  kind: "match" | "champion";
  source: "manual" | "ai";
  batchId: string | null;
  phaseLabel: string | null;
  matchId: string | null;
  teamA: string | null;
  teamB: string | null;
  stage: string | null;
  groupCode: string | null;
  scoreA: number | null;
  scoreB: number | null;
  champion: string | null;
  runnerUp: string | null;
};

export type BatchPromptLine = {
  promptText: string;
  createdAt: string;
};

export async function fetchPredictionHistory(limit = 400): Promise<{
  entries: PredictionHistoryEntry[];
  batchPrompts?: Record<string, BatchPromptLine[]>;
}> {
  return fetchAuth(`/predictions/me/history?limit=${limit}`);
}

export type ResultPrediction = Prediction & { hasResult: boolean; isHit: boolean };

export async function fetchMyResults(): Promise<{
  predictions: ResultPrediction[];
  totalHits: number;
  totalWithResult: number;
}> {
  return fetchAuth("/results/me");
}

export type LeaderboardEntry = {
  userId: string;
  alias: string;
  hits: number;
  rank: number;
  rankChange?: number;
};

export async function fetchLeaderboard(): Promise<{
  leaderboard: LeaderboardEntry[];
  myRank: number | null;
}> {
  return fetchAuth("/leaderboard");
}

export type CompetitionLeaderboardBlock = {
  id: string;
  name: string;
  slug: string;
  leaderboard: LeaderboardEntry[];
  myRank: number | null;
  totalParticipants: number;
  rankChange: number;
};

export type ResultsDashboard = {
  totalHits: number;
  totalWithResult: number;
  precision: number;
  leaderboard: LeaderboardEntry[];
  myRank: number | null;
  totalParticipants: number;
  rankChange: number;
  pointsOverTime: { date: string; points: number }[];
  /** Tablas por liga; mismas predicciones globales, ranking acotado a miembros. */
  competitionLeaderboards: CompetitionLeaderboardBlock[];
};

export async function fetchResultsDashboard(): Promise<ResultsDashboard> {
  return fetchAuth("/results/dashboard");
}

export type CompetitionQuota = {
  scope: "user" | "company";
  createdByMe: number;
  maxCreatedByMe: number | null;
  companyTotal: number | null;
  maxCompany: number | null;
};

export type CompetitionCardSnapshot = {
  myRank: number | null;
  totalParticipants: number;
  topThree: Array<{ userId: string; displayLabel: string; rank: number }>;
};

export type MyCompetitionSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  emoji: string | null;
  coverImageUrl: string | null;
  maxMembers: number;
  createdAt: string;
  createdById: string;
  memberCount: number;
  myRole: "competition_admin" | "member";
  isCreator: boolean;
  card: CompetitionCardSnapshot;
};

export type MineCompetitionsResponse = {
  competitions: MyCompetitionSummary[];
  quota: CompetitionQuota;
};

export async function fetchMyCompetitions(): Promise<MineCompetitionsResponse> {
  return fetchAuth("/competitions/mine");
}

export async function createCompetition(body: {
  name: string;
  maxMembers: number;
  description?: string | null;
  emoji?: string | null;
  coverImageUrl?: string | null;
}): Promise<{
  competition: {
    id: string;
    name: string;
    slug: string;
    inviteCode: string;
    description: string | null;
    emoji: string | null;
    coverImageUrl: string | null;
    maxMembers: number;
    createdAt: string;
  };
}> {
  return fetchAuth("/competitions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Unirse por código; si ya eras miembro devuelve alreadyMember con competitionId. */
export async function joinCompetitionByCode(
  code: string
): Promise<{ ok: true; competitionId: string } | { alreadyMember: true; competitionId: string }> {
  const token = getToken();
  if (!token) throw new Error("Unauthorized");
  const url = `${API_BASE}/competitions/join`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: code.trim() }),
  });
  const text = await res.text();
  let data: { ok?: boolean; competitionId?: string; error?: string; message?: string } = {};
  if (text && !text.startsWith("<")) {
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      throw new Error("Respuesta inválida de la API");
    }
  }
  if (res.status === 201 && data.competitionId) {
    return { ok: true, competitionId: data.competitionId };
  }
  if (res.status === 409 && data.competitionId) {
    return { alreadyMember: true, competitionId: data.competitionId };
  }
  if (!res.ok) {
    throw new Error(data.message ?? data.error ?? "No se pudo unir a la liga");
  }
  throw new Error("Respuesta inesperada del servidor");
}

export async function patchCompetition(
  competitionId: string,
  body: {
    name?: string;
    description?: string | null;
    emoji?: string | null;
    coverImageUrl?: string | null;
    maxMembers?: number;
  }
): Promise<{
  competition: {
    id: string;
    name: string;
    slug: string;
    inviteCode: string;
    description: string | null;
    emoji: string | null;
    coverImageUrl: string | null;
    maxMembers: number;
    createdAt: string;
  };
}> {
  return fetchAuth(`/competitions/${encodeURIComponent(competitionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function removeCompetitionMember(
  competitionId: string,
  memberUserId: string
): Promise<{ ok: boolean }> {
  return fetchAuth(
    `/competitions/${encodeURIComponent(competitionId)}/members/${encodeURIComponent(memberUserId)}`,
    { method: "DELETE" }
  );
}

export type InviteToCompetitionResult =
  | { ok: true; mode: "joined" }
  | {
      ok: true;
      mode: "email_invite";
      inviteUrl: string;
      emailSent: boolean;
      emailError?: string;
    };

export async function inviteToCompetition(
  competitionId: string,
  email: string
): Promise<InviteToCompetitionResult> {
  return fetchAuth(`/competitions/${encodeURIComponent(competitionId)}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export async function fetchCompetitionInvitePreview(token: string): Promise<{
  competitionName: string;
  companyName: string;
  email: string;
  inviterLabel: string | null;
  accountExists: boolean;
}> {
  const url = `${API_BASE}/auth/competition-invite/preview?token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await parseJson<
    {
      competitionName: string;
      companyName: string;
      email: string;
      inviterLabel: string | null;
      accountExists: boolean;
      error?: string;
    } & { message?: string }
  >(res, url);
  if (!res.ok) {
    throw new Error(data.error ?? "Invitación no válida");
  }
  return data;
}

export async function acceptCompetitionInvite(
  token: string,
  password: string,
  fullName?: string
): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/auth/competition-invite/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password, fullName }),
  });
  const data = await parseJson<
    { token: string; user: User; error?: string; message?: string } & { message?: string }
  >(res, `${API_BASE}/auth/competition-invite/accept`);
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message ?? data.error ?? "No se pudo crear la cuenta"
    );
  }
  return data as { token: string; user: User };
}

export async function claimCompetitionInvite(token: string): Promise<{
  ok: boolean;
  competitionId: string;
  alreadyMember?: boolean;
}> {
  return fetchAuth("/auth/competition-invite/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export type CompetitionDetailResponse = {
  competition: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    emoji: string | null;
    coverImageUrl: string | null;
    maxMembers: number;
    createdAt: string;
    createdById: string;
    memberCount: number;
    inviteCode?: string;
  };
  myRole: "competition_admin" | "member";
  members: {
    userId: string;
    email: string;
    fullName: string | null;
    role: "competition_admin" | "member";
  }[];
};

export async function fetchCompetitionDetail(
  competitionId: string
): Promise<CompetitionDetailResponse> {
  return fetchAuth(`/competitions/${encodeURIComponent(competitionId)}`);
}

export async function leaveCompetition(competitionId: string): Promise<{ ok: boolean }> {
  return fetchAuth(`/competitions/${encodeURIComponent(competitionId)}/membership`, {
    method: "DELETE",
  });
}

export async function submitPrediction(
  matchId: string,
  scoreA: number,
  scoreB: number
): Promise<{ prediction: Prediction }> {
  return fetchAuth("/predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matchId, scoreA, scoreB }),
  });
}

export type PromptLog = {
  id: string;
  promptText: string;
  responseText: string;
  model: string;
  createdAt: string;
};

export async function sendChatPrompt(prompt: string): Promise<{ response: string; model: string }> {
  return fetchAuth("/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

export async function fetchMyPrompts(): Promise<{ prompts: PromptLog[] }> {
  return fetchAuth("/prompts/me");
}

export type ProdeGuidelinesByPhase = {
  groups: string;
  roundOf32: string;
  knockout: string;
};

export async function fetchProdeGuidelines(): Promise<{ guidelines: ProdeGuidelinesByPhase }> {
  return fetchAuth("/me/guidelines");
}

export type ProdeStatus = {
  hasGuidelines: boolean;
  hasPredictions: boolean;
  guidelinesVersion: number;
};

export async function fetchProdeStatus(): Promise<ProdeStatus> {
  return fetchAuth("/me/prode-status");
}

export type ChampionPrediction = {
  champion: string;
  runnerUp: string;
  updatedAt?: string;
};

export async function fetchChampionPrediction(): Promise<{
  championPrediction: ChampionPrediction | null;
}> {
  return fetchAuth("/prode/champion-prediction");
}

export type ProdePhaseId = "groups" | "roundOf32" | "knockout";

export async function generateProdePredictions(phase: ProdePhaseId): Promise<{
  predictions: Prediction[];
  championPrediction: ChampionPrediction | null;
}> {
  return fetchAuth("/ai/generate-prode-predictions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phase }),
  });
}

export async function updateProdeGuidelines(
  guidelines: ProdeGuidelinesByPhase
): Promise<{ guidelines: ProdeGuidelinesByPhase }> {
  return fetchAuth("/me/guidelines", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(guidelines),
  });
}

export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  status: string;
  createdAt: string;
};

export type AdminMetric = {
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
  logins: number;
  prompts: number;
  predictions: number;
};

/** Sin fechas = todo el período; con `from`/`to` (YYYY-MM-DD) = filtrado en servidor. */
export type AdminReportRange = "all" | { from: string; to: string };

function adminReportQuery(range: AdminReportRange): string {
  if (range === "all") return "";
  return `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

export async function fetchAdminUsers(range: AdminReportRange = "all"): Promise<{ users: AdminUser[] }> {
  return fetchAuth(`/admin/users${adminReportQuery(range)}`);
}

export async function createAdminUser(data: {
  email: string;
  password: string;
  fullName?: string;
  role?: "member" | "org_admin";
}): Promise<{ user: AdminUser }> {
  return fetchAuth("/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateAdminUser(
  id: string,
  data: { fullName?: string; role?: string; status?: string }
): Promise<{ user: AdminUser }> {
  return fetchAuth(`/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteAdminUser(id: string): Promise<{ ok: boolean }> {
  return fetchAuth(`/admin/users/${id}`, { method: "DELETE" });
}

export async function fetchAdminMetrics(range: AdminReportRange = "all"): Promise<{ metrics: AdminMetric[] }> {
  return fetchAuth(`/admin/metrics${adminReportQuery(range)}`);
}

export type AdminStats = {
  totalUsers: number;
  totalLogins: number;
  totalPrompts: number;
  totalPredictions: number;
  promptsPerUser: string;
};

export async function fetchAdminStats(range: AdminReportRange = "all"): Promise<AdminStats> {
  return fetchAuth(`/admin/stats${adminReportQuery(range)}`);
}

export type TimeSeriesPoint = {
  date: string;
  users: number;
  prompts: number;
};

export async function fetchAdminTimeSeries(
  range: AdminReportRange = "all"
): Promise<{ data: TimeSeriesPoint[] }> {
  return fetchAuth(`/admin/metrics/time-series${adminReportQuery(range)}`);
}

export type AiConfig = {
  provider: string;
  model: string;
  baseUrl: string | null;
  hasApiKey: boolean;
};

export async function fetchAdminAiConfig(): Promise<{ config: AiConfig | null }> {
  return fetchAuth("/admin/ai-config");
}

export async function fetchAdminCompanyConfig(): Promise<{ anonymizationEnabled: boolean }> {
  return fetchAuth("/admin/company-config");
}

export async function updateAdminCompanyConfig(data: {
  anonymizationEnabled: boolean;
}): Promise<{ anonymizationEnabled: boolean }> {
  return fetchAuth("/admin/company-config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateAdminAiConfig(data: {
  provider?: "openai" | "custom" | "gemini" | "grok" | "groq" | "ollama";
  model?: string;
  baseUrl?: string | null;
  apiKey?: string;
}): Promise<{ config: AiConfig }> {
  return fetchAuth("/admin/ai-config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function syncMatchResults(): Promise<{
  ok: boolean;
  updated: number;
  totalApi: number;
  message: string;
}> {
  return fetchAuth("/admin/sync-match-results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function setMatchResult(
  matchId: string,
  resultScoreA: number,
  resultScoreB: number
): Promise<{ ok: boolean }> {
  return fetchAuth(`/admin/matches/${matchId}/result`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resultScoreA, resultScoreB }),
  });
}

export async function downloadExport(
  type: "prompts" | "logins" | "users",
  range: AdminReportRange = "all"
): Promise<void> {
  const token = getToken();
  if (!token) throw new Error("Unauthorized");
  const base = API_BASE;
  const q = adminReportQuery(range);
  const res = await fetch(`${base}/admin/exports/${type}.csv${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text();
    let msg = "Error al descargar";
    try {
      const j = JSON.parse(errText) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* CSV u otro */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const cd = res.headers.get("Content-Disposition");
  const m = cd?.match(/filename=([^;]+)/i);
  const filename = m?.[1]?.replace(/"/g, "").trim() || `${type}.csv`;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
