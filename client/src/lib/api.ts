/** URL base del backend (sin barra final). En producción debe venir de VITE_API_URL en el build (Railway). */
function resolveApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (import.meta.env.DEV) {
    return (fromEnv || "/api").replace(/\/+$/, "") || "/api";
  }
  const fallback = "http://localhost:4000";
  const base = (fromEnv || fallback).replace(/\/+$/, "");
  if (import.meta.env.PROD && !fromEnv) {
    // eslint-disable-next-line no-console
    console.error(
      "[Promptplay] Falta VITE_API_URL en el build. En Railway: Variables del servicio frontend → VITE_API_URL = https://tu-backend.up.railway.app (sin / al final) → Redeploy."
    );
  }
  return base;
}

const API_BASE = resolveApiBase();

/** True si el build de producción no incluyó la URL del API (el login fallará). */
export const isProductionApiUrlMissing =
  import.meta.env.PROD && !import.meta.env.VITE_API_URL;

const TOKEN_KEY = "rrhhia_token";

function networkHint(err: unknown): Error {
  // fetch() lanza TypeError ante fallos de red / CORS
  if (err instanceof TypeError) {
    return new Error(
      "No se pudo conectar con el servidor. Si estás en la web publicada: en Railway agregá la variable VITE_API_URL con la URL https del backend (sin barra al final) y volvé a desplegar el frontend."
    );
  }
  return err instanceof Error ? err : new Error(String(err));
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
    throw new Error(hint);
  }
  try {
    return text ? JSON.parse(text) : ({} as T);
  } catch {
    throw new Error("Respuesta inválida de la API");
  }
}

async function fetchAuth<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("Unauthorized");
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
    throw new Error(msg);
  }
  return data;
}

export type Match = {
  id: string;
  stage: string;
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

export type User = {
  id: string;
  email: string;
  fullName: string | null;
  role: "employee" | "admin";
  companyId: string;
  status?: string;
  createdAt?: string;
};

export type LoginResponse = {
  token: string;
  user: User;
};

export type SignupResponse = LoginResponse;

export async function login(email: string, password: string): Promise<LoginResponse> {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await parseJson<LoginResponse & { error?: string }>(res, `${API_BASE}/auth/login`);
    if (!res.ok) throw new Error(data.error ?? "Login failed");
    return data;
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
    return data;
  } catch (e) {
    throw networkHint(e);
  }
}

export async function fetchMe(token?: string): Promise<{ user: User }> {
  if (token) {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await parseJson<{ user: User; error?: string }>(res);
    if (!res.ok) throw new Error(data.error ?? "Unauthorized");
    return data;
  }
  return fetchAuth("/me");
}

export async function updateMe(data: { fullName?: string; password?: string }): Promise<{ user: User }> {
  return fetchAuth("/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function fetchMatches(): Promise<{ matches: Match[] }> {
  return fetchAuth("/matches");
}

export async function fetchMyPredictions(): Promise<{ predictions: Prediction[] }> {
  return fetchAuth("/predictions/me");
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

export type ResultsDashboard = {
  totalHits: number;
  totalWithResult: number;
  precision: number;
  leaderboard: LeaderboardEntry[];
  myRank: number | null;
  totalParticipants: number;
  rankChange: number;
  pointsOverTime: { date: string; points: number }[];
};

export async function fetchResultsDashboard(): Promise<ResultsDashboard> {
  return fetchAuth("/results/dashboard");
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

export async function fetchProdeGuidelines(): Promise<{ guidelines: string }> {
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

export async function updateProdeGuidelines(text: string): Promise<{ guidelines: string }> {
  return fetchAuth("/me/guidelines", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
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

export async function fetchAdminUsers(): Promise<{ users: AdminUser[] }> {
  return fetchAuth("/admin/users");
}

export async function createAdminUser(data: {
  email: string;
  password: string;
  fullName?: string;
  role?: "employee" | "admin";
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

export async function fetchAdminMetrics(): Promise<{ metrics: AdminMetric[] }> {
  return fetchAuth("/admin/metrics");
}

export type AdminStats = {
  totalUsers: number;
  totalLogins: number;
  totalPrompts: number;
  totalPredictions: number;
  promptsPerUser: string;
};

export async function fetchAdminStats(): Promise<AdminStats> {
  return fetchAuth("/admin/stats");
}

export type TimeSeriesPoint = {
  date: string;
  users: number;
  prompts: number;
};

export async function fetchAdminTimeSeries(): Promise<{ data: TimeSeriesPoint[] }> {
  return fetchAuth("/admin/metrics/time-series");
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

export async function downloadExport(type: "prompts" | "logins" | "users"): Promise<void> {
  const token = getToken();
  if (!token) throw new Error("Unauthorized");
  const base = API_BASE;
  const res = await fetch(`${base}/admin/exports/${type}.csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Error al descargar");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${type}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
