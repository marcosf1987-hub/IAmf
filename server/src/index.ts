import cors from "cors";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, MatchStage, PredictionHistoryKind } from "@prisma/client";
import {
  signAccessToken,
  requireAuth,
  verifyAccessToken,
  getAccessTokenFromRequest,
  type AuthedRequest,
} from "./auth";
import { csrfProtectionMiddleware } from "./csrf-middleware";
import { buildMeResponse } from "./me-response";
import { clearSessionCookies, setSessionCookies } from "./session-cookie";
import { hashPassword, verifyPassword } from "./password";
import { chat } from "./ai-provider";
import { parseAiScore, parseAiChampionRunnerUp, parseAiBatchScoresJson } from "./ai-parse";
import { syncMatchResultsFromFootballData, startFootballDataResultAutoSync } from "./sync-match-results";
import { anonymizeUserId, isExactHit } from "./leaderboard";
import { adminCreateUserSchema, adminUpdateUserSchema, adminAiConfigSchema, loginSchema, predictionSchema, signupSchema, chatSchema, updateMeSchema, matchResultSchema, prodeGuidelinesSchema } from "./validators";
import { encrypt, decrypt } from "./crypto-util";
import { registerB2BRoutes } from "./b2b-routes";
import { isPlatformCompanySlug } from "./org-seat";
import { enrichMatchRowWithInferredGroupCode } from "./group-code-infer";
import { ensureUniversalLeagueMembership } from "./universal-league";
import { buildResultsDashboardPayload } from "./results-dashboard";
import { registerCompetitionRoutes } from "./competitions-routes";
import { registerCompetitionInviteRoutes } from "./competition-invite-routes";
import { registerF1Routes } from "./f1-routes";
import { mountOAuthRoutes } from "./oauth";
import { syncF1FinishedRaceResults, syncF1SeasonRaces } from "./openf1-sync";

/** Express 5 tipa `req.params` como string | string[] */
function routeParamId(req: express.Request): string | undefined {
  const raw = req.params.id;
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

const app = express();
const prisma = new PrismaClient();

function parseAllowedOrigins(): Set<string> {
  const out = new Set<string>();
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (raw) {
    for (const item of raw.split(",")) {
      const origin = item.trim().replace(/\/+$/, "");
      if (origin) out.add(origin);
    }
  }
  const frontend = process.env.FRONTEND_URL?.trim().replace(/\/+$/, "");
  if (frontend) out.add(frontend);
  out.add("http://localhost:5173");
  out.add("http://127.0.0.1:5173");
  return out;
}

const allowedOrigins = parseAllowedOrigins();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
});

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too_many_requests" },
});

/** Admin de empresa (`org_admin`): el rol debe coincidir con la **base de datos**, no solo con el JWT. */
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
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
      select: { id: true, role: true, companyId: true, status: true },
    });
    if (!user || user.status !== "active") {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    if (user.role !== "org_admin") {
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
    console.error("requireAdmin:", err);
    res.status(500).json({ error: "server_error" });
  }
}

// Detrás de Railway / reverse proxy
app.set("trust proxy", 1);

// Sin allowedHeaders restringido: el preflight debe poder enviar Accept, Cache-Control, etc.
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // requests server-to-server, health checks o curl sin Origin
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalized = origin.trim().replace(/\/+$/, "");
      if (allowedOrigins.has(normalized)) {
        callback(null, normalized);
        return;
      }
      callback(new Error("cors_not_allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(csrfProtectionMiddleware);
app.use("/auth/login", authLimiter);
app.use("/auth/signup", authLimiter);
app.use("/auth/logout", authLimiter);
app.use("/ai", aiLimiter);
app.use("/admin", adminLimiter);

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof Error && err.message === "cors_not_allowed") {
    res.status(403).json({ error: "cors_not_allowed" });
    return;
  }
  next(err);
});

registerB2BRoutes(app, prisma);
registerCompetitionRoutes(app, prisma);
registerCompetitionInviteRoutes(app, prisma);
registerF1Routes(app, prisma);
mountOAuthRoutes(app, prisma);

/** Raíz: la API no sirve HTML; el frontend es otro servicio. Evita confusión al abrir la URL del backend en el navegador. */
app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "Promptplay API",
    message: "Usa el frontend para la app web. Probar estado: GET /health",
    health: "/health",
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

/** Próximos partidos (sin auth: home marketing y /app). */
app.get("/public/upcoming-matches", async (req, res) => {
  try {
    const raw = req.query.limit;
    const parsed = raw !== undefined && raw !== "" ? parseInt(String(raw), 10) : NaN;
    const limit = Math.min(20, Math.max(1, Number.isFinite(parsed) && parsed > 0 ? parsed : 5));
    const now = new Date();
    const rows = await prisma.match.findMany({
      where: { kickoffAt: { gt: now } },
      orderBy: { kickoffAt: "asc" },
      take: limit,
      select: {
        id: true,
        stage: true,
        groupCode: true,
        teamA: true,
        teamB: true,
        kickoffAt: true,
        resultScoreA: true,
        resultScoreB: true,
      },
    });
    const matches = rows.map(enrichMatchRowWithInferredGroupCode);
    res.status(200).json({ matches });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("GET /public/upcoming-matches error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/db/health", async (_req, res) => {
  try {
    const result = await prisma.$queryRaw<{ now: Date }[]>`SELECT NOW() as now`;
    res.status(200).json({ ok: true, now: result[0]?.now ?? null });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

app.post("/auth/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const { email, password, fullName } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "email_in_use" });
    return;
  }

  const platformCompany = await prisma.company.findUnique({
    where: { slug: "platform-internal" },
  });
  if (!platformCompany) {
    res.status(503).json({
      error: "platform_not_configured",
      message:
        "Falta la compañía plataforma en la base. Ejecutá prisma db seed (PLATFORM_SUPER_ADMIN_EMAIL opcional).",
    });
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      companyId: platformCompany.id,
      role: "member",
      status: "active",
    },
    select: { id: true, email: true, fullName: true, role: true, companyId: true },
  });

  try {
    await ensureUniversalLeagueMembership(prisma, user.id);
  } catch (leagueErr) {
    // eslint-disable-next-line no-console
    console.error("ensureUniversalLeagueMembership (signup):", leagueErr);
  }

  const token = signAccessToken({ userId: user.id, role: user.role, companyId: user.companyId });
  const me = await buildMeResponse(prisma, user.id);
  if (!me) {
    res.status(500).json({ error: "server_error" });
    return;
  }
  setSessionCookies(res, token);
  res.status(201).json(me);
});

app.post("/auth/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }

    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true, role: true, companyId: true, passwordHash: true, status: true },
    });
    if (!user || user.status !== "active") {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    if (!user.passwordHash) {
      res.status(401).json({
        error: "no_password",
        message:
          "Esta cuenta no tiene contraseña local. Usá «Continuar con Google» o contactá soporte si entraste por invitación.",
      });
      return;
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    await prisma.loginEvent.create({
      data: {
        userId: user.id,
        ip: req.ip,
        userAgent: req.header("user-agent") ?? null,
      },
    });

    const token = signAccessToken({ userId: user.id, role: user.role, companyId: user.companyId });
    const me = await buildMeResponse(prisma, user.id);
    if (!me) {
      res.status(500).json({ error: "server_error" });
      return;
    }
    setSessionCookies(res, token);
    res.status(200).json(me);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("POST /auth/login:", err);
    res.status(500).json({ error: "server_error" });
  }
});

/** Cierra sesión: borra cookies de acceso y CSRF (el cliente debe usar credentials). */
app.post("/auth/logout", (_req, res) => {
  clearSessionCookies(res);
  res.status(204).end();
});

app.get("/matches", requireAuth, async (_req, res) => {
  try {
    const rows = await prisma.match.findMany({
      orderBy: { kickoffAt: "asc" },
      select: {
        id: true,
        stage: true,
        groupCode: true,
        teamA: true,
        teamB: true,
        kickoffAt: true,
        resultScoreA: true,
        resultScoreB: true,
      },
    });
    const matches = rows.map(enrichMatchRowWithInferredGroupCode);
    res.status(200).json({ matches });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("GET /matches error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/predictions", requireAuth, async (req, res) => {
  const parsed = predictionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { userId } = (req as AuthedRequest).auth;
  const { matchId, scoreA, scoreB } = parsed.data;

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    res.status(404).json({ error: "match_not_found" });
    return;
  }

  const prediction = await prisma.prediction.upsert({
    where: {
      userId_matchId: { userId, matchId },
    },
    update: { scoreA, scoreB },
    create: { userId, matchId, scoreA, scoreB },
    select: { id: true, matchId: true, scoreA: true, scoreB: true, createdAt: true },
  });
  try {
    await prisma.predictionHistory.create({
      data: {
        userId,
        kind: PredictionHistoryKind.match,
        matchId,
        scoreA,
        scoreB,
        source: "manual",
      },
    });
  } catch (histErr) {
    // eslint-disable-next-line no-console
    console.error("PredictionHistory (manual) no se pudo guardar. ¿Ejecutaste prisma migrate deploy?", histErr);
  }
  res.status(200).json({ prediction });
});

app.get("/ai/health", requireAuth, async (req, res) => {
  const { companyId } = (req as AuthedRequest).auth;
  const aiConfig = await prisma.aiConfig.findUnique({
    where: { companyId },
  });
  const hasDbKey = Boolean(aiConfig?.apiKeyEnc);
  const hasOllama = aiConfig?.provider === "ollama";
  const hasEnvKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  res.status(200).json({ configured: hasDbKey || hasOllama || hasEnvKey });
});

app.post("/ai/chat", requireAuth, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { userId, companyId } = (req as AuthedRequest).auth;
  const { prompt } = parsed.data;

  let chatConfig: { provider?: string; apiKey: string; model: string; baseUrl?: string | null } | null = null;
  const aiConfig = await prisma.aiConfig.findUnique({
    where: { companyId },
  });
  if (aiConfig) {
    try {
      chatConfig = {
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKeyEnc ? decrypt(aiConfig.apiKeyEnc) : "ollama",
        model: aiConfig.model,
        baseUrl: aiConfig.baseUrl,
      };
    } catch {
      // Si falla el decrypt, usar env
    }
  }

  try {
    const result = await chat(prompt, chatConfig);

    await prisma.promptLog.create({
      data: {
        userId,
        provider: aiConfig?.provider ?? process.env.AI_PROVIDER ?? "openai",
        model: result.model,
        promptText: prompt,
        responseText: result.text,
        tokensIn: result.tokensIn ?? undefined,
        tokensOut: result.tokensOut ?? undefined,
      },
    });

    res.status(200).json({ response: result.text, model: result.model });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("POST /ai/chat error:", err);
    res.status(500).json({ error: "ai_error" });
  }
});

const PHASE_STAGES: Record<string, MatchStage[]> = {
  groups: ["group"],
  roundOf32: ["roundOf32"],
  knockout: ["roundOf16", "quarterFinal", "semiFinal", "thirdPlace", "final"],
};

async function countMatchesInStages(stages: MatchStage[]) {
  return prisma.match.count({ where: { stage: { in: stages } } });
}

async function countUserPredictionsInStages(userId: string, stages: MatchStage[]) {
  return prisma.prediction.count({
    where: { userId, match: { stage: { in: stages } } },
  });
}

type ProdePromptPhase = "groups" | "roundOf32" | "knockout";

function prodePhaseNameEs(phaseKey: ProdePromptPhase): string {
  switch (phaseKey) {
    case "groups":
      return "fase de grupos";
    case "roundOf32":
      return "treintaidosavos (R32)";
    default:
      return "eliminatorias (octavos a la final, y campeón)";
  }
}

function buildProdeChampionPrompt(pautas: string): string {
  return `Estás ayudando a completar pronósticos del Prode (Mundial).

Las pautas del usuario son criterios de la etapa eliminatoria: rigen los partidos de esta fase; aplicá la misma coherencia para campeón y subcampeón.

--- PAUTAS DEL USUARIO (toda esta etapa) ---
${pautas}
---

Pregunta concreta: ¿Quiénes serán el campeón y subcampeón del Mundial FIFA 2026?

Responde ÚNICAMENTE con dos nombres de selecciones separados por guión en el orden campeón-subcampeón, por ejemplo: Argentina-Brasil. Sin explicaciones ni texto extra.`;
}

function normalizeGroupCodeKey(g: string | null | undefined): string {
  if (!g?.trim()) return "";
  return g.trim().toUpperCase();
}

/** Partidos de fase de grupos agrupados por groupCode; sin código van al último bloque. */
function partitionGroupMatches(
  matches: Array<{ id: string; teamA: string; teamB: string; groupCode: string | null }>
): Array<{ scopeLabel: string; matches: typeof matches }> {
  const ungrouped: typeof matches = [];
  const byCode = new Map<string, typeof matches>();
  for (const m of matches) {
    const k = normalizeGroupCodeKey(m.groupCode);
    if (!k) {
      ungrouped.push(m);
      continue;
    }
    if (!byCode.has(k)) byCode.set(k, []);
    byCode.get(k)!.push(m);
  }
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const keys = Array.from(byCode.keys()).sort((a, b) => {
    if (a.length === 1 && b.length === 1) {
      const ia = letters.indexOf(a);
      const ib = letters.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
    }
    return a.localeCompare(b, undefined, { numeric: true });
  });
  const out: Array<{ scopeLabel: string; matches: typeof matches }> = [];
  for (const k of keys) {
    const arr = byCode.get(k)!;
    arr.sort((a, b) => a.id.localeCompare(b.id));
    out.push({ scopeLabel: `Grupo ${k}`, matches: arr });
  }
  if (ungrouped.length) {
    ungrouped.sort((a, b) => a.id.localeCompare(b.id));
    out.push({ scopeLabel: "Partidos de grupos sin zona (groupCode vacío)", matches: ungrouped });
  }
  return out;
}

function buildProdeBatchJsonPrompt(params: {
  phaseKey: ProdePromptPhase;
  pautas: string;
  scopeLabel: string;
  matches: { id: string; teamA: string; teamB: string }[];
}): string {
  const lines = params.matches
    .map(
      (m, i) =>
        `${i + 1}. id="${m.id}" → ${m.teamA} (local) vs ${m.teamB} (visitante); scoreA = goles de ${m.teamA}, scoreB = goles de ${m.teamB}`
    )
    .join("\n");
  const phaseName = prodePhaseNameEs(params.phaseKey);
  return `Estás ayudando a completar pronósticos del Prode (Mundial).

Ámbito: ${params.scopeLabel}. Etapa: ${phaseName}.

Las pautas del usuario orientan de forma coherente todos los marcadores de este bloque.

--- PAUTAS DEL USUARIO ---
${params.pautas}
---

Partidos (las claves del JSON deben ser exactamente estos id, sin modificar):
${lines}

Respondé ÚNICAMENTE con un objeto JSON válido (sin markdown ni texto fuera del JSON). Cada clave es el id del partido. Cada valor es un objeto {"scoreA": número, "scoreB": número} con enteros entre 0 y 20, o un string "2-1" donde el primer número son goles del equipo local (teamA) y el segundo del visitante (teamB).`;
}

/** Si el lote JSON falla, un prompt corto por partido (mismo formato que antes). */
function buildProdeSingleMatchFallbackPrompt(
  phaseKey: ProdePromptPhase,
  pautas: string,
  teamA: string,
  teamB: string
): string {
  const phaseName = prodePhaseNameEs(phaseKey);
  return `Estás ayudando con pronósticos del Prode (Mundial). Etapa: ${phaseName}.

--- PAUTAS DEL USUARIO ---
${pautas}
---

Partido: ${teamA} (local) vs ${teamB} (visitante).

Respondé ÚNICAMENTE con dos números separados por guión en el orden goles de ${teamA} - goles de ${teamB} (ej.: 2-1). Sin explicaciones ni texto extra.`;
}

const KNOCKOUT_BATCH_ORDER: MatchStage[] = ["roundOf16", "quarterFinal", "semiFinal", "thirdPlace", "final"];

const KNOCKOUT_STAGE_LABEL: Partial<Record<MatchStage, string>> = {
  roundOf16: "Octavos de final",
  quarterFinal: "Cuartos de final",
  semiFinal: "Semifinales",
  thirdPlace: "Tercer puesto",
  final: "Final",
};

app.post("/ai/generate-prode-predictions", requireAuth, async (req, res) => {
  const { userId, companyId } = (req as AuthedRequest).auth;
  const phase = (req.body?.phase as string) || "groups";
  const rawGroupCode = req.body?.groupCode;
  const groupCodeFilter =
    typeof rawGroupCode === "string" && rawGroupCode.trim().length > 0 ? rawGroupCode.trim() : undefined;
  const stages = PHASE_STAGES[phase] ?? PHASE_STAGES.groups;

  const [needGroup, haveGroup] = await Promise.all([
    countMatchesInStages(["group"]),
    countUserPredictionsInStages(userId, ["group"]),
  ]);
  const [needR32, haveR32] = await Promise.all([
    countMatchesInStages(["roundOf32"]),
    countUserPredictionsInStages(userId, ["roundOf32"]),
  ]);

  if (phase === "roundOf32" && needGroup > 0 && haveGroup < needGroup) {
    res.status(400).json({
      error: "complete_groups_first",
      message: `Primero tienes que generar predicciones para todos los partidos de fase de grupos (${haveGroup}/${needGroup}).`,
    });
    return;
  }
  if (phase === "knockout" && needR32 > 0 && haveR32 < needR32) {
    res.status(400).json({
      error: "complete_roundof32_first",
      message: `Primero completa predicciones para todos los partidos de la fase anterior (16avos / R32: ${haveR32}/${needR32}).`,
    });
    return;
  }

  const [matches, guidelinesRow, aiConfig] = await Promise.all([
    prisma.match.findMany({
      where: { stage: { in: stages } },
      orderBy: { kickoffAt: "asc" },
      select: { id: true, teamA: true, teamB: true, groupCode: true, stage: true, kickoffAt: true },
    }),
    prisma.prodeGuidelines.findUnique({
      where: { userId },
      select: { textGroups: true, textRoundOf32: true, textKnockout: true },
    }),
    prisma.aiConfig.findUnique({ where: { companyId } }),
  ]);

  let chatConfig: { provider?: string; apiKey: string; model: string; baseUrl?: string | null } | null = null;
  if (aiConfig) {
    try {
      chatConfig = {
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKeyEnc ? decrypt(aiConfig.apiKeyEnc) : "ollama",
        model: aiConfig.model,
        baseUrl: aiConfig.baseUrl,
      };
    } catch {
      // Si falla el decrypt, usar env
    }
  }

  const phaseKey = phase === "groups" || phase === "roundOf32" || phase === "knockout" ? phase : "groups";
  const rawPautas =
    phaseKey === "groups"
      ? (guidelinesRow?.textGroups ?? "")
      : phaseKey === "roundOf32"
        ? (guidelinesRow?.textRoundOf32 ?? "")
        : (guidelinesRow?.textKnockout ?? "");
  const pautas = rawPautas.trim();
  if (!pautas) {
    const phaseLabel =
      phaseKey === "groups"
        ? "Fase de grupos"
        : phaseKey === "roundOf32"
          ? "Treintaidosavos (R32)"
          : "Eliminatorias";
    res.status(400).json({
      error: "guidelines_required",
      message: `No hay pautas guardadas para ${phaseLabel}. Escribe y guarda ese bloque en el Laboratorio antes de generar predicciones con IA para esta etapa.`,
    });
    return;
  }

  type MatchWork = {
    id: string;
    teamA: string;
    teamB: string;
    groupCode: string | null;
    stage: MatchStage;
  };

  /** Misma inferencia que GET /matches: si en BD `groupCode` es null, se rellena desde el fixture (p. ej. Grupo A). */
  let workMatches: MatchWork[] = matches.map((row) => {
    const e = enrichMatchRowWithInferredGroupCode(row);
    return {
      id: e.id,
      teamA: e.teamA,
      teamB: e.teamB,
      groupCode: e.groupCode,
      stage: e.stage,
    };
  });

  if (phase === "groups" && groupCodeFilter) {
    const g = groupCodeFilter.toLowerCase();
    if (g === "ungrouped") {
      workMatches = workMatches.filter((m) => !m.groupCode?.trim());
    } else {
      const want = normalizeGroupCodeKey(groupCodeFilter);
      workMatches = workMatches.filter((m) => normalizeGroupCodeKey(m.groupCode) === want);
    }
    if (workMatches.length === 0) {
      res.status(400).json({
        error: "no_matches_for_group",
        message: `No hay partidos de grupos para «${groupCodeFilter}».`,
      });
      return;
    }
  }

  const predictions: Array<{ id: string; matchId: string; scoreA: number; scoreB: number; createdAt: Date }> = [];
  let championPrediction: { champion: string; runnerUp: string } | null = null;
  const batchId = randomUUID();
  const promptPhase = phaseKey as ProdePromptPhase;

  async function runMatchBatch(scopeLabel: string, batchMatches: Array<{ id: string; teamA: string; teamB: string }>) {
    if (batchMatches.length === 0) return;
    const prompt = buildProdeBatchJsonPrompt({
      phaseKey: promptPhase,
      pautas,
      scopeLabel,
      matches: batchMatches,
    });
    try {
      const result = await chat(prompt, chatConfig);

      await prisma.promptLog.create({
        data: {
          userId,
          batchId,
          provider: aiConfig?.provider ?? process.env.AI_PROVIDER ?? "openai",
          model: result.model,
          promptText: prompt,
          responseText: result.text,
          tokensIn: result.tokensIn ?? undefined,
          tokensOut: result.tokensOut ?? undefined,
        },
      });

      const ids = new Set(batchMatches.map((m) => m.id));
      let parsedMap = parseAiBatchScoresJson(result.text, ids);

      if (parsedMap.size === 0 && batchMatches.length === 1) {
        const fallback = parseAiScore(result.text);
        if (fallback) {
          parsedMap = new Map([[batchMatches[0].id, fallback]]);
        }
      }

      const missingAfterBatch = batchMatches.filter((m) => !parsedMap.has(m.id));
      for (const m of missingAfterBatch) {
        try {
          const sp = buildProdeSingleMatchFallbackPrompt(promptPhase, pautas, m.teamA, m.teamB);
          const singleRes = await chat(sp, chatConfig);
          await prisma.promptLog.create({
            data: {
              userId,
              batchId,
              provider: aiConfig?.provider ?? process.env.AI_PROVIDER ?? "openai",
              model: singleRes.model,
              promptText: sp,
              responseText: singleRes.text,
              tokensIn: singleRes.tokensIn ?? undefined,
              tokensOut: singleRes.tokensOut ?? undefined,
            },
          });
          const one = parseAiScore(singleRes.text);
          if (one) parsedMap.set(m.id, one);
        } catch (singleErr) {
          // eslint-disable-next-line no-console
          console.error(`Fallback 1 partido (${scopeLabel}) ${m.id}:`, singleErr);
        }
      }

      for (const m of batchMatches) {
        const parsed = parsedMap.get(m.id);
        if (!parsed) continue;
        try {
          const pred = await prisma.prediction.upsert({
            where: { userId_matchId: { userId, matchId: m.id } },
            update: { scoreA: parsed.scoreA, scoreB: parsed.scoreB },
            create: { userId, matchId: m.id, scoreA: parsed.scoreA, scoreB: parsed.scoreB },
            select: { id: true, matchId: true, scoreA: true, scoreB: true, createdAt: true },
          });
          try {
            await prisma.predictionHistory.create({
              data: {
                userId,
                kind: PredictionHistoryKind.match,
                matchId: m.id,
                scoreA: parsed.scoreA,
                scoreB: parsed.scoreB,
                source: "ai",
                batchId,
                phaseLabel: phase,
              },
            });
          } catch (histErr) {
            // eslint-disable-next-line no-console
            console.error("PredictionHistory (IA) no se pudo guardar. ¿Migración aplicada?", histErr);
          }
          predictions.push(pred);
        } catch (predErr) {
          // eslint-disable-next-line no-console
          console.error(`Error upsert prediction ${m.id}:`, predErr);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Error batch IA (${scopeLabel}):`, err);
    }
  }

  if (phase === "groups") {
    const parts = partitionGroupMatches(workMatches);
    for (const part of parts) {
      await runMatchBatch(part.scopeLabel, part.matches);
    }
  } else if (phase === "roundOf32") {
    await runMatchBatch("Treintaidosavos (R32) — todos los partidos", workMatches);
  } else if (phase === "knockout") {
    for (const st of KNOCKOUT_BATCH_ORDER) {
      const roundMatches = workMatches.filter((m) => m.stage === st);
      if (roundMatches.length === 0) continue;
      const label = KNOCKOUT_STAGE_LABEL[st] ?? st;
      await runMatchBatch(`${label} — eliminatorias`, roundMatches);
    }
  }

  // Generar predicción de campeón y subcampeón solo en fase knockout
  if (phase === "knockout") {
    try {
      const championPrompt = buildProdeChampionPrompt(pautas);
      const championResult = await chat(championPrompt, chatConfig);

      await prisma.promptLog.create({
        data: {
          userId,
          batchId,
          provider: aiConfig?.provider ?? process.env.AI_PROVIDER ?? "openai",
          model: championResult.model,
          promptText: championPrompt,
          responseText: championResult.text,
          tokensIn: championResult.tokensIn ?? undefined,
          tokensOut: championResult.tokensOut ?? undefined,
        },
      });

      const parsed = parseAiChampionRunnerUp(championResult.text);
      if (parsed) {
        await prisma.prodeChampionPrediction.upsert({
          where: { userId },
          update: { champion: parsed.champion, runnerUp: parsed.runnerUp },
          create: { userId, champion: parsed.champion, runnerUp: parsed.runnerUp },
        });
        try {
          await prisma.predictionHistory.create({
            data: {
              userId,
              kind: PredictionHistoryKind.champion,
              champion: parsed.champion,
              runnerUp: parsed.runnerUp,
              source: "ai",
              batchId,
              phaseLabel: phase,
            },
          });
        } catch (histErr) {
          // eslint-disable-next-line no-console
          console.error("PredictionHistory (campeón) no se pudo guardar. ¿Migración aplicada?", histErr);
        }
        championPrediction = parsed;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error generating champion prediction:", err);
    }
  }

  res.status(200).json({
    predictions: predictions.map((p) => ({
      id: p.id,
      matchId: p.matchId,
      scoreA: p.scoreA,
      scoreB: p.scoreB,
      createdAt: p.createdAt.toISOString(),
    })),
    championPrediction,
  });
});

app.get("/prompts/me", requireAuth, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const logs = await prisma.promptLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, promptText: true, responseText: true, model: true, createdAt: true },
  });
  res.status(200).json({ prompts: logs });
});

app.get("/prode/champion-prediction", requireAuth, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const pred = await prisma.prodeChampionPrediction.findUnique({
    where: { userId },
    select: { champion: true, runnerUp: true, updatedAt: true },
  });
  res.status(200).json({ championPrediction: pred });
});

app.get("/predictions/me/history", requireAuth, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const limitRaw = Number.parseInt(String(req.query.limit ?? "400"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 400;

  try {
    const rows = await prisma.predictionHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        match: {
          select: {
            id: true,
            stage: true,
            teamA: true,
            teamB: true,
            groupCode: true,
          },
        },
      },
    });

    const entries = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      kind: r.kind,
      source: r.source,
      batchId: r.batchId,
      phaseLabel: r.phaseLabel,
      matchId: r.matchId,
      teamA: r.match?.teamA ?? null,
      teamB: r.match?.teamB ?? null,
      stage: r.match?.stage ?? null,
      groupCode: r.match?.groupCode ?? null,
      scoreA: r.scoreA,
      scoreB: r.scoreB,
      champion: r.champion,
      runnerUp: r.runnerUp,
    }));

    const batchIds = [...new Set(entries.map((e) => e.batchId).filter((id): id is string => Boolean(id)))];
    const batchPrompts: Record<string, Array<{ promptText: string; createdAt: string }>> = {};
    if (batchIds.length > 0) {
      const logs = await prisma.promptLog.findMany({
        where: { userId, batchId: { in: batchIds } },
        orderBy: { createdAt: "asc" },
        select: { batchId: true, promptText: true, createdAt: true },
      });
      for (const log of logs) {
        if (!log.batchId) continue;
        if (!batchPrompts[log.batchId]) batchPrompts[log.batchId] = [];
        batchPrompts[log.batchId].push({
          promptText: log.promptText,
          createdAt: log.createdAt.toISOString(),
        });
      }
    }

    res.status(200).json({ entries, batchPrompts });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("GET /predictions/me/history error:", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
      res.status(503).json({
        error: "migration_required",
        message:
          "Falta aplicar migraciones en la base de datos (tabla PredictionHistory). En el servidor debe ejecutarse prisma migrate deploy; en local: cd server && npx prisma migrate dev",
      });
      return;
    }
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/predictions/me", requireAuth, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const predictions = await prisma.prediction.findMany({
    where: { userId },
    include: {
      match: { select: { id: true, stage: true, teamA: true, teamB: true, kickoffAt: true, resultScoreA: true, resultScoreB: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json({ predictions });
});

app.get("/results/me", requireAuth, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const predictions = await prisma.prediction.findMany({
    where: { userId },
    include: {
      match: { select: { id: true, stage: true, teamA: true, teamB: true, kickoffAt: true, resultScoreA: true, resultScoreB: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const withHits = predictions.map((p) => {
    const hasResult = p.match.resultScoreA != null && p.match.resultScoreB != null;
    const isHit = hasResult && isExactHit(p.scoreA, p.scoreB, p.match.resultScoreA, p.match.resultScoreB);
    return {
      ...p,
      hasResult,
      isHit,
    };
  });

  const totalHits = withHits.filter((p) => p.isHit).length;
  const totalWithResult = withHits.filter((p) => p.hasResult).length;

  res.status(200).json({
    predictions: withHits,
    totalHits,
    totalWithResult,
  });
});

app.get("/admin/company-config", requireAdmin, async (req, res) => {
  const { companyId } = (req as AuthedRequest).auth;
  const config = await prisma.companyConfig.findUnique({
    where: { companyId },
  });
  res.status(200).json({
    anonymizationEnabled: config?.anonymizationEnabled ?? true,
  });
});

app.patch("/admin/company-config", requireAdmin, async (req, res) => {
  const { companyId } = (req as AuthedRequest).auth;
  const anonymizationEnabled = req.body?.anonymizationEnabled;
  if (typeof anonymizationEnabled !== "boolean") {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const config = await prisma.companyConfig.upsert({
    where: { companyId },
    create: { companyId, anonymizationEnabled },
    update: { anonymizationEnabled },
  });
  res.status(200).json({ anonymizationEnabled: config.anonymizationEnabled });
});

app.get("/leaderboard", requireAuth, async (req, res) => {
  const { userId, companyId } = (req as AuthedRequest).auth;

  const [matchesWithResult, companyUsers, companyConfig] = await Promise.all([
    prisma.match.findMany({
      where: {
        resultScoreA: { not: null },
        resultScoreB: { not: null },
      },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { companyId, status: "active" },
      select: { id: true, fullName: true, email: true },
    }),
    prisma.companyConfig.findUnique({
      where: { companyId },
      select: { anonymizationEnabled: true },
    }),
  ]);

  const matchIds = matchesWithResult.map((m) => m.id);
  if (matchIds.length === 0) {
    res.status(200).json({ leaderboard: [], myRank: null });
    return;
  }

  const companyUserIds = companyUsers.map((u) => u.id);
  const userById = new Map(companyUsers.map((u) => [u.id, u]));
  const anonymized = companyConfig?.anonymizationEnabled ?? true;

  const predictions = await prisma.prediction.findMany({
    where: {
      userId: { in: companyUserIds },
      matchId: { in: matchIds },
    },
    include: {
      match: { select: { resultScoreA: true, resultScoreB: true } },
    },
  });

  const hitsByUser = new Map<string, number>();
  for (const p of predictions) {
    const isHit = isExactHit(
      p.scoreA,
      p.scoreB,
      p.match.resultScoreA,
      p.match.resultScoreB
    );
    if (isHit) {
      hitsByUser.set(p.userId, (hitsByUser.get(p.userId) ?? 0) + 1);
    }
  }

  const leaderboard = companyUserIds
    .map((uid) => {
      const u = userById.get(uid);
      const displayName = anonymized
        ? anonymizeUserId(uid, companyId)
        : (u?.fullName?.trim() || u?.email || "Usuario");
      return {
        userId: uid,
        alias: displayName,
        hits: hitsByUser.get(uid) ?? 0,
      };
    })
    .sort((a, b) => b.hits - a.hits)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const myEntry = leaderboard.find((r) => r.userId === userId);
  const myRank = myEntry ? myEntry.rank : null;

  res.status(200).json({ leaderboard, myRank });
});

app.get("/results/dashboard", requireAuth, async (req, res) => {
  const { userId, companyId } = (req as AuthedRequest).auth;
  try {
    const payload = await buildResultsDashboardPayload(prisma, userId, companyId);
    res.status(200).json(payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("GET /results/dashboard:", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/admin/sync-match-results", requireAdmin, async (_req, res) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!apiKey) {
    res.status(400).json({
      error: "missing_config",
      message: "Agrega FOOTBALL_DATA_API_KEY en server/.env. Obtén una gratis en https://www.football-data.org/",
    });
    return;
  }

  try {
    const result = await syncMatchResultsFromFootballData(prisma, apiKey);
    const {
      updated,
      totalApi,
      apiMatchesConsidered,
      teamsResolved,
      pendingInDb,
      skippedFetch,
    } = result;

    const detail = skippedFetch
      ? "Sin filas pendientes; no se llamó a la API."
      : `${pendingInDb} fila(s) pendiente(s) en BD, ${apiMatchesConsidered}/${totalApi} partido(s) API en ventana.`;

    res.status(200).json({
      ok: true,
      updated,
      totalApi,
      apiMatchesConsidered,
      teamsResolved,
      pendingInDb,
      skippedFetch,
      message: `Actualizado: ${updated} fila(s) (${teamsResolved} reemplazo(s) TBD). ${detail}`,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("POST /admin/sync-match-results error:", err);
    res.status(500).json({ error: "sync_error" });
  }
});

app.patch("/admin/matches/:id/result", requireAdmin, async (req, res) => {
  const parsed = matchResultSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const id = routeParamId(req);
  if (!id) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const match = await prisma.match.findUnique({ where: { id } });
  if (!match) {
    res.status(404).json({ error: "match_not_found" });
    return;
  }
  await prisma.match.update({
    where: { id },
    data: { resultScoreA: parsed.data.resultScoreA, resultScoreB: parsed.data.resultScoreB },
  });
  res.status(200).json({ ok: true });
});

const ADMIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type AdminDateRangeResult =
  | { ok: true; range?: { from: Date; to: Date } }
  | { ok: false; message: string };

/** Query `from` y `to` en YYYY-MM-DD (día UTC). Sin parámetros = todo el período. */
function parseAdminDateRangeQuery(req: express.Request): AdminDateRangeResult {
  const fromRaw = typeof req.query.from === "string" ? req.query.from.trim() : "";
  const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";
  if (!fromRaw && !toRaw) return { ok: true };
  if (!fromRaw || !toRaw) {
    return { ok: false, message: "Indicá fecha desde y hasta, o ninguna para todo el período." };
  }
  if (!ADMIN_DATE_RE.test(fromRaw) || !ADMIN_DATE_RE.test(toRaw)) {
    return { ok: false, message: "Las fechas deben tener formato YYYY-MM-DD." };
  }
  const from = new Date(`${fromRaw}T00:00:00.000Z`);
  const to = new Date(`${toRaw}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, message: "Fecha inválida." };
  }
  if (from > to) {
    return { ok: false, message: "La fecha desde no puede ser posterior a la fecha hasta." };
  }
  return { ok: true, range: { from, to } };
}

app.get("/admin/stats", requireAdmin, async (req, res) => {
  const parsed = parseAdminDateRangeQuery(req);
  if (!parsed.ok) {
    res.status(400).json({ error: "invalid_query", message: parsed.message });
    return;
  }
  const { companyId } = (req as AuthedRequest).auth;
  const range = parsed.range;

  const activeUsersDenominator = await prisma.user.count({
    where: { companyId, status: "active" },
  });

  if (!range) {
    const [totalUsers, totalLogins, totalPrompts, totalPredictions] = await Promise.all([
      prisma.user.count({ where: { companyId, status: "active" } }),
      prisma.loginEvent.count({ where: { user: { companyId } } }),
      prisma.promptLog.count({ where: { user: { companyId } } }),
      prisma.prediction.count({ where: { user: { companyId } } }),
    ]);
    const promptsPerUser = activeUsersDenominator > 0 ? (totalPrompts / activeUsersDenominator).toFixed(1) : "0";
    res.status(200).json({
      totalUsers,
      totalLogins,
      totalPrompts,
      totalPredictions,
      promptsPerUser,
    });
    return;
  }

  const { from, to } = range;
  const [totalUsers, totalLogins, totalPrompts, totalPredictions] = await Promise.all([
    prisma.user.count({
      where: { companyId, status: "active", createdAt: { gte: from, lte: to } },
    }),
    prisma.loginEvent.count({
      where: { user: { companyId }, createdAt: { gte: from, lte: to } },
    }),
    prisma.promptLog.count({
      where: { user: { companyId }, createdAt: { gte: from, lte: to } },
    }),
    prisma.prediction.count({
      where: { user: { companyId }, createdAt: { gte: from, lte: to } },
    }),
  ]);
  const promptsPerUser = activeUsersDenominator > 0 ? (totalPrompts / activeUsersDenominator).toFixed(1) : "0";

  res.status(200).json({
    totalUsers,
    totalLogins,
    totalPrompts,
    totalPredictions,
    promptsPerUser,
  });
});

app.get("/admin/ai-config", requireAdmin, async (req, res) => {
  const { companyId } = (req as AuthedRequest).auth;
  const config = await prisma.aiConfig.findUnique({
    where: { companyId },
  });
  if (!config) {
    res.status(200).json({
      config: null,
    });
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

app.patch("/admin/ai-config", requireAdmin, async (req, res) => {
  const parsed = adminAiConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((e) => `${e.path.map(String).join(".")}: ${e.message}`)
      .join("; ");
    res.status(400).json({ error: "invalid_body", message: msg });
    return;
  }
  const { companyId } = (req as AuthedRequest).auth;
  const { provider, model, baseUrl, apiKey } = parsed.data;

  const existing = await prisma.aiConfig.findUnique({
    where: { companyId },
  });

  const data: { provider?: string; model?: string; baseUrl?: string | null; apiKeyEnc?: string | null } = {};
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

app.get("/admin/users", requireAdmin, async (req, res) => {
  const parsed = parseAdminDateRangeQuery(req);
  if (!parsed.ok) {
    res.status(400).json({ error: "invalid_query", message: parsed.message });
    return;
  }
  const { companyId } = (req as AuthedRequest).auth;
  const range = parsed.range;
  const users = await prisma.user.findMany({
    where: {
      companyId,
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
    },
    select: { id: true, email: true, fullName: true, role: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json({ users });
});

app.post("/admin/users", requireAdmin, async (req, res) => {
  const parsed = adminCreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { companyId } = (req as AuthedRequest).auth;
  const { email, password, fullName, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "email_in_use" });
    return;
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    res.status(404).json({ error: "company_not_found" });
    return;
  }

  if (!isPlatformCompanySlug(company.slug)) {
    const active = await prisma.user.count({
      where: {
        companyId,
        status: "active",
        role: { in: ["org_admin", "member"] },
      },
    });
    const pending = await prisma.invitation.count({
      where: { companyId, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (active + pending >= company.seatLimit) {
      res.status(400).json({ error: "insufficient_seats", message: "No hay cupos disponibles." });
      return;
    }
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      role: role ?? "member",
      companyId,
      status: "active",
    },
    select: { id: true, email: true, fullName: true, role: true, status: true, createdAt: true },
  });
  res.status(201).json({ user });
});

app.patch("/admin/users/:id", requireAdmin, async (req, res) => {
  const parsed = adminUpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { companyId } = (req as AuthedRequest).auth;
  const id = routeParamId(req);
  if (!id) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const updates = parsed.data;

  const existing = await prisma.user.findFirst({
    where: { id, companyId },
  });
  if (!existing) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }

  const user = await prisma.user.update({
    where: { id },
    data: updates,
    select: { id: true, email: true, fullName: true, role: true, status: true, createdAt: true },
  });
  res.status(200).json({ user });
});

app.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  const { companyId } = (req as AuthedRequest).auth;
  const id = routeParamId(req);
  if (!id) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }

  const existing = await prisma.user.findFirst({
    where: { id, companyId },
  });
  if (!existing) {
    res.status(404).json({ error: "user_not_found" });
    return;
  }

  await prisma.user.update({
    where: { id },
    data: { status: "disabled" },
  });
  res.status(200).json({ ok: true });
});

app.get("/admin/metrics", requireAdmin, async (req, res) => {
  const parsed = parseAdminDateRangeQuery(req);
  if (!parsed.ok) {
    res.status(400).json({ error: "invalid_query", message: parsed.message });
    return;
  }
  const { companyId } = (req as AuthedRequest).auth;
  const range = parsed.range;
  const dateWhere = range ? { gte: range.from, lte: range.to } : undefined;

  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, email: true, fullName: true, role: true },
  });

  const metrics = await Promise.all(
    users.map(async (u) => {
      const [logins, prompts, predictions] = await Promise.all([
        prisma.loginEvent.count({
          where: { userId: u.id, ...(dateWhere ? { createdAt: dateWhere } : {}) },
        }),
        prisma.promptLog.count({
          where: { userId: u.id, ...(dateWhere ? { createdAt: dateWhere } : {}) },
        }),
        prisma.prediction.count({
          where: { userId: u.id, ...(dateWhere ? { createdAt: dateWhere } : {}) },
        }),
      ]);
      return {
        userId: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        logins,
        prompts,
        predictions,
      };
    })
  );

  res.status(200).json({ metrics });
});

app.get("/admin/metrics/time-series", requireAdmin, async (req, res) => {
  const parsed = parseAdminDateRangeQuery(req);
  if (!parsed.ok) {
    res.status(400).json({ error: "invalid_query", message: parsed.message });
    return;
  }
  const { companyId } = (req as AuthedRequest).auth;
  const range = parsed.range;

  type Row = { d: Date; c: bigint };
  const usersByDay = range
    ? await prisma.$queryRaw<Row[]>`
    SELECT date_trunc('day', "createdAt")::date as d, count(*)::bigint as c
    FROM "User"
    WHERE "companyId" = ${companyId}
      AND "createdAt" >= ${range.from}
      AND "createdAt" <= ${range.to}
    GROUP BY date_trunc('day', "createdAt")::date
    ORDER BY d
  `
    : await prisma.$queryRaw<Row[]>`
    SELECT date_trunc('day', "createdAt")::date as d, count(*)::bigint as c
    FROM "User"
    WHERE "companyId" = ${companyId}
    GROUP BY date_trunc('day', "createdAt")::date
    ORDER BY d
  `;
  const promptsByDay = range
    ? await prisma.$queryRaw<Row[]>`
    SELECT date_trunc('day', p."createdAt")::date as d, count(*)::bigint as c
    FROM "PromptLog" p
    JOIN "User" u ON p."userId" = u.id
    WHERE u."companyId" = ${companyId}
      AND p."createdAt" >= ${range.from}
      AND p."createdAt" <= ${range.to}
    GROUP BY date_trunc('day', p."createdAt")::date
    ORDER BY d
  `
    : await prisma.$queryRaw<Row[]>`
    SELECT date_trunc('day', p."createdAt")::date as d, count(*)::bigint as c
    FROM "PromptLog" p
    JOIN "User" u ON p."userId" = u.id
    WHERE u."companyId" = ${companyId}
    GROUP BY date_trunc('day', p."createdAt")::date
    ORDER BY d
  `;

  const userMap = new Map<string, number>();
  for (const r of usersByDay) {
    const key = (r.d instanceof Date ? r.d : new Date(r.d)).toISOString().slice(0, 10);
    userMap.set(key, Number(r.c));
  }
  const promptMap = new Map<string, number>();
  for (const r of promptsByDay) {
    const key = (r.d instanceof Date ? r.d : new Date(r.d)).toISOString().slice(0, 10);
    promptMap.set(key, Number(r.c));
  }

  const allDates = new Set<string>([...userMap.keys(), ...promptMap.keys()]);
  const sortedDates = Array.from(allDates).sort();

  let cumUsers = 0;
  let cumPrompts = 0;
  const data: { date: string; users: number; prompts: number }[] = [];

  for (const date of sortedDates) {
    cumUsers += userMap.get(date) ?? 0;
    cumPrompts += promptMap.get(date) ?? 0;
    data.push({ date, users: cumUsers, prompts: cumPrompts });
  }

  res.status(200).json({ data });
});

app.get("/admin/exports/prompts.csv", requireAdmin, async (req, res) => {
  const parsed = parseAdminDateRangeQuery(req);
  if (!parsed.ok) {
    res.status(400).json({ error: "invalid_query", message: parsed.message });
    return;
  }
  const range = parsed.range;
  const { companyId } = (req as AuthedRequest).auth;

  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, email: true },
  });
  const userIds = users.map((u) => u.id);
  const userMap = new Map(users.map((u) => [u.id, u.email]));

  const logs = await prisma.promptLog.findMany({
    where: {
      userId: { in: userIds },
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { userId: true, promptText: true, responseText: true, model: true, createdAt: true },
  });

  const header = "email,createdAt,model,promptText,responseText\n";
  const rows = logs.map(
    (l) =>
      `"${(userMap.get(l.userId) ?? "").replace(/"/g, '""')}","${l.createdAt.toISOString()}","${l.model}","${(l.promptText ?? "").replace(/"/g, '""')}","${(l.responseText ?? "").replace(/"/g, '""')}"`
  );
  const csv = header + rows.join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  const filename = range
    ? `prompts_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv`
    : "prompts.csv";
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  res.status(200).send("\uFEFF" + csv);
});

app.get("/admin/exports/logins.csv", requireAdmin, async (req, res) => {
  const parsed = parseAdminDateRangeQuery(req);
  if (!parsed.ok) {
    res.status(400).json({ error: "invalid_query", message: parsed.message });
    return;
  }
  const range = parsed.range;
  const { companyId } = (req as AuthedRequest).auth;

  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, email: true },
  });
  const userIds = users.map((u) => u.id);
  const userMap = new Map(users.map((u) => [u.id, u.email]));

  const events = await prisma.loginEvent.findMany({
    where: {
      userId: { in: userIds },
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { userId: true, ip: true, userAgent: true, createdAt: true },
  });

  const header = "email,createdAt,ip,userAgent\n";
  const rows = events.map(
    (l) =>
      `"${(userMap.get(l.userId) ?? "").replace(/"/g, '""')}","${l.createdAt.toISOString()}","${l.ip ?? ""}","${(l.userAgent ?? "").replace(/"/g, '""')}"`
  );
  const csv = header + rows.join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  const loginsFilename = range
    ? `logins_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv`
    : "logins.csv";
  res.setHeader("Content-Disposition", `attachment; filename=${loginsFilename}`);
  res.status(200).send("\uFEFF" + csv);
});

app.get("/admin/exports/users.csv", requireAdmin, async (req, res) => {
  const parsed = parseAdminDateRangeQuery(req);
  if (!parsed.ok) {
    res.status(400).json({ error: "invalid_query", message: parsed.message });
    return;
  }
  const range = parsed.range;
  const { companyId } = (req as AuthedRequest).auth;

  const users = await prisma.user.findMany({
    where: {
      companyId,
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
    },
    select: { email: true, fullName: true, role: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const header = "email,fullName,role,status,createdAt\n";
  const rows = users.map(
    (u) =>
      `"${u.email.replace(/"/g, '""')}","${(u.fullName ?? "").replace(/"/g, '""')}","${u.role}","${u.status}","${u.createdAt.toISOString()}"`
  );
  const csv = header + rows.join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  const usersFilename = range
    ? `users_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv`
    : "users.csv";
  res.setHeader("Content-Disposition", `attachment; filename=${usersFilename}`);
  res.status(200).send("\uFEFF" + csv);
});

app.get("/me", requireAuth, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const me = await buildMeResponse(prisma, userId);
  if (!me) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(200).json(me);
});

app.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { userId } = (req as AuthedRequest).auth;
  const updates: { fullName?: string; passwordHash?: string } = {};

  if (parsed.data.fullName !== undefined) updates.fullName = parsed.data.fullName;
  if (parsed.data.password !== undefined) {
    updates.passwordHash = await hashPassword(parsed.data.password);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "nothing_to_update" });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: updates,
  });
  const me = await buildMeResponse(prisma, userId);
  if (!me) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(200).json(me);
});

app.get("/me/prode-status", requireAuth, async (req, res) => {
  try {
    const { userId } = (req as AuthedRequest).auth;
    const [guidelines, predCount] = await Promise.all([
      prisma.prodeGuidelines.findUnique({
        where: { userId },
        select: { textGroups: true, textRoundOf32: true, textKnockout: true, version: true },
      }),
      prisma.prediction.count({ where: { userId } }),
    ]);
    const hasGuidelines = Boolean(
      guidelines?.textGroups?.trim() || guidelines?.textRoundOf32?.trim() || guidelines?.textKnockout?.trim()
    );
    const hasPredictions = predCount > 0;
    res.status(200).json({
      hasGuidelines,
      hasPredictions,
      guidelinesVersion: guidelines?.version ?? 1,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("GET /me/prode-status error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/me/guidelines", requireAuth, async (req, res) => {
  try {
    const { userId } = (req as AuthedRequest).auth;
    const g = await prisma.prodeGuidelines.findUnique({
      where: { userId },
    });
    res.status(200).json({
      guidelines: {
        groups: g?.textGroups ?? "",
        roundOf32: g?.textRoundOf32 ?? "",
        knockout: g?.textKnockout ?? "",
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("GET /me/guidelines error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

app.patch("/me/guidelines", requireAuth, async (req, res) => {
  const parsed = prodeGuidelinesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  try {
    const { userId } = (req as AuthedRequest).auth;
    const { groups, roundOf32, knockout } = parsed.data;
    const existing = await prisma.prodeGuidelines.findUnique({
      where: { userId },
      select: { version: true },
    });
    const g = existing
      ? await prisma.prodeGuidelines.update({
          where: { userId },
          data: {
            textGroups: groups,
            textRoundOf32: roundOf32,
            textKnockout: knockout,
            version: existing.version + 1,
          },
        })
      : await prisma.prodeGuidelines.create({
          data: { userId, textGroups: groups, textRoundOf32: roundOf32, textKnockout: knockout },
        });
    res.status(200).json({
      guidelines: {
        groups: g.textGroups,
        roundOf32: g.textRoundOf32,
        knockout: g.textKnockout,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("PATCH /me/guidelines error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
  startFootballDataResultAutoSync(prisma);
  if (process.env.OPENF1_BOOTSTRAP_SYNC !== "false") {
    const year = new Date().getFullYear();
    void (async () => {
      try {
        const n = await syncF1SeasonRaces(prisma, year);
        const r = await syncF1FinishedRaceResults(prisma);
        // eslint-disable-next-line no-console
        console.log(`OpenF1 bootstrap: ${n} races (${year}), ${r} result sync(s)`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("OpenF1 bootstrap sync failed:", e);
      }
    })();
  }
});

