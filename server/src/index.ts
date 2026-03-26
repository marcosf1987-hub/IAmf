import cors from "cors";
import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, MatchStage, PredictionHistoryKind } from "@prisma/client";
import { signAccessToken, requireAuth, verifyAccessToken, type AuthedRequest } from "./auth";
import { hashPassword, verifyPassword } from "./password";
import { chat } from "./ai-provider";
import { parseAiScore, parseAiChampionRunnerUp } from "./ai-parse";
import {
  fetchWorldCupMatches,
  findMatchingOurMatch,
  mapScoreToOurMatch,
} from "./football-data";
import { anonymizeUserId, isExactHit } from "./leaderboard";
import { adminCreateUserSchema, adminUpdateUserSchema, adminAiConfigSchema, loginSchema, predictionSchema, signupSchema, chatSchema, updateMeSchema, matchResultSchema, prodeGuidelinesSchema } from "./validators";
import { encrypt, decrypt } from "./crypto-util";

/** Express 5 tipa `req.params` como string | string[] */
function routeParamId(req: express.Request): string | undefined {
  const raw = req.params.id;
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

const app = express();
const prisma = new PrismaClient();

/** Admin: el rol debe coincidir con la **base de datos**, no solo con el JWT (si promovieron a admin, el token viejo decía employee → 403). */
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
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
    if (!user || user.status !== "active") {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    if (user.role !== "admin") {
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

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));

/** Raíz: la API no sirve HTML; el frontend es otro servicio. Evita confusión al abrir la URL del backend en el navegador. */
app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "Promptplay API",
    message: "Usá el frontend para la app web. Probar estado: GET /health",
    health: "/health",
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
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

  const company = await prisma.company.upsert({
    where: { name: "DemoCompany" },
    update: {},
    create: { name: "DemoCompany" },
  });

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      companyId: company.id,
      role: "employee",
      status: "active",
    },
    select: { id: true, email: true, fullName: true, role: true, companyId: true },
  });

  const token = signAccessToken({ userId: user.id, role: user.role, companyId: user.companyId });
  res.status(201).json({ token, user });
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
    res.status(200).json({
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, companyId: user.companyId },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("POST /auth/login:", err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      error: "server_error",
      message: msg.includes("JWT_SECRET") ? "JWT_SECRET no configurado en el servidor" : msg,
    });
  }
});

app.get("/matches", requireAuth, async (_req, res) => {
  try {
    const matches = await prisma.match.findMany({
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
    res.status(200).json({ matches });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("GET /matches error:", err);
    res.status(500).json({ error: "server_error", message: err instanceof Error ? err.message : String(err) });
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
    console.error("PredictionHistory (manual) no se pudo guardar. ¿Corriste prisma migrate deploy?", histErr);
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
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: "ai_error", message: msg });
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

/** Un prompt por partido: las pautas se repiten en cada llamada pero el encuadre aclara que rigen toda la etapa. */
function buildProdeMatchPrompt(params: {
  phaseKey: ProdePromptPhase;
  pautas: string;
  teamA: string;
  teamB: string;
  matchIndex1Based: number;
  matchTotal: number;
}): string {
  const { phaseKey, pautas, teamA, teamB, matchIndex1Based, matchTotal } = params;
  const phaseName = prodePhaseNameEs(phaseKey);
  const batchHint =
    matchTotal > 1
      ? `Esta etapa tiene ${matchTotal} partidos en el fixture; cada llamada de la API es un partido distinto. Ahora corresponde el partido ${matchIndex1Based} de ${matchTotal}. Las pautas de arriba aplican a todos los pronósticos de esta etapa, no solo a este.\n\n`
      : "";

  return `Estás ayudando a completar pronósticos del Prode (Mundial).

Las pautas del usuario que siguen son criterios generales de la etapa «${phaseName}»: orientan cómo pensar todos los marcadores de esta ventana del torneo. No las interpretes como atadas solo al partido de esta pregunta: son la guía coherente para cada resultado de esta fase.

--- PAUTAS DEL USUARIO (toda esta etapa) ---
${pautas}
---

${batchHint}Pregunta concreta (respondé únicamente el marcador de este partido): ¿Cuál será el resultado del partido de fútbol entre ${teamA} y ${teamB}?

Responde ÚNICAMENTE con dos números separados por guión en el orden ${teamA}-${teamB}, por ejemplo: 2-1. Sin explicaciones ni texto extra.`;
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

app.post("/ai/generate-prode-predictions", requireAuth, async (req, res) => {
  const { userId, companyId } = (req as AuthedRequest).auth;
  const phase = (req.body?.phase as string) || "groups";
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
      message: `Primero tenés que generar predicciones para todos los partidos de fase de grupos (${haveGroup}/${needGroup}).`,
    });
    return;
  }
  if (phase === "knockout" && needR32 > 0 && haveR32 < needR32) {
    res.status(400).json({
      error: "complete_roundof32_first",
      message: `Primero completá predicciones para todos los partidos de la fase anterior (16avos / R32: ${haveR32}/${needR32}).`,
    });
    return;
  }

  const [matches, guidelinesRow, aiConfig] = await Promise.all([
    prisma.match.findMany({
      where: { stage: { in: stages } },
      orderBy: { kickoffAt: "asc" },
      select: { id: true, teamA: true, teamB: true },
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
      message: `No hay pautas guardadas para ${phaseLabel}. Escribí y guardá ese bloque en el Laboratorio antes de generar predicciones con IA para esta etapa.`,
    });
    return;
  }

  const predictions: Array<{ id: string; matchId: string; scoreA: number; scoreB: number; createdAt: Date }> = [];
  let championPrediction: { champion: string; runnerUp: string } | null = null;
  const batchId = randomUUID();
  const matchTotal = matches.length;
  const promptPhase = phaseKey as ProdePromptPhase;

  for (let idx = 0; idx < matches.length; idx++) {
    const m = matches[idx];
    try {
      const prompt = buildProdeMatchPrompt({
        phaseKey: promptPhase,
        pautas,
        teamA: m.teamA,
        teamB: m.teamB,
        matchIndex1Based: idx + 1,
        matchTotal,
      });
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

      const parsed = parseAiScore(result.text);
      if (parsed) {
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
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Error generating prediction for match ${m.id}:`, err);
      // Continuar con el siguiente partido
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
    res.status(500).json({ error: "server_error", message: err instanceof Error ? err.message : String(err) });
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

  const matchesWithResult = await prisma.match.findMany({
    where: {
      resultScoreA: { not: null },
      resultScoreB: { not: null },
    },
    select: { id: true, kickoffAt: true, resultScoreA: true, resultScoreB: true },
    orderBy: { kickoffAt: "asc" },
  });

  if (matchesWithResult.length === 0) {
    res.status(200).json({
      totalHits: 0,
      totalWithResult: 0,
      precision: 0,
      leaderboard: [],
      myRank: null,
      totalParticipants: 0,
      rankChange: 0,
      pointsOverTime: [],
    });
    return;
  }

  const matchIds = matchesWithResult.map((m) => m.id);
  const [companyUsers, companyConfig] = await Promise.all([
    prisma.user.findMany({
      where: { companyId, status: "active" },
      select: { id: true, fullName: true, email: true },
    }),
    prisma.companyConfig.findUnique({
      where: { companyId },
      select: { anonymizationEnabled: true },
    }),
  ]);
  const companyUserIds = companyUsers.map((u) => u.id);
  const userById = new Map(companyUsers.map((u) => [u.id, u]));
  const anonymized = companyConfig?.anonymizationEnabled ?? true;

  const predictions = await prisma.prediction.findMany({
    where: {
      userId: { in: companyUserIds },
      matchId: { in: matchIds },
    },
    include: {
      match: { select: { id: true, resultScoreA: true, resultScoreB: true, kickoffAt: true } },
    },
  });

  // Puntos acumulados por usuario por fecha (después de cada partido)
  const hitsByUserByMatchIdx = new Map<string, number[]>();
  for (const uid of companyUserIds) {
    hitsByUserByMatchIdx.set(uid, []);
  }

  for (let i = 0; i < matchesWithResult.length; i++) {
    const m = matchesWithResult[i];
    for (const uid of companyUserIds) {
      const pred = predictions.find((p) => p.userId === uid && p.matchId === m.id);
      const prevHits = i === 0 ? 0 : (hitsByUserByMatchIdx.get(uid) ?? [])[i - 1] ?? 0;
      const isHit = pred && isExactHit(pred.scoreA, pred.scoreB, m.resultScoreA, m.resultScoreB);
      const cum = prevHits + (isHit ? 1 : 0);
      const arr = hitsByUserByMatchIdx.get(uid)!;
      arr.push(cum);
    }
  }

  // Evolución de puntos para el usuario actual
  const myHitsOverTime = hitsByUserByMatchIdx.get(userId) ?? [];
  const pointsOverTime = matchesWithResult.map((m, i) => ({
    date: m.kickoffAt.toISOString().slice(0, 10),
    points: myHitsOverTime[i] ?? 0,
  }));

  // Leaderboard actual
  const hitsByUser = new Map<string, number>();
  for (const uid of companyUserIds) {
    const arr = hitsByUserByMatchIdx.get(uid) ?? [];
    hitsByUser.set(uid, arr[arr.length - 1] ?? 0);
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
  const totalHits = myEntry?.hits ?? 0;
  const totalWithResult = matchesWithResult.length;
  const precision = totalWithResult > 0 ? Math.round((totalHits / totalWithResult) * 100) : 0;

  // Rank change por usuario: comparar con estado anterior (antes del último partido)
  const prevHitsByUser = new Map<string, number>();
  for (const uid of companyUserIds) {
    const arr = hitsByUserByMatchIdx.get(uid) ?? [];
    prevHitsByUser.set(uid, arr.length > 1 ? arr[arr.length - 2] : 0);
  }
  const prevLeaderboard = companyUserIds
    .map((uid) => ({ userId: uid, hits: prevHitsByUser.get(uid) ?? 0 }))
    .sort((a, b) => b.hits - a.hits)
    .map((r, i) => ({ ...r, prevRank: i + 1 }));

  const prevRankByUser = new Map(prevLeaderboard.map((r) => [r.userId, r.prevRank]));
  const leaderboardWithChange = leaderboard.map((e) => {
    const prevRank = prevRankByUser.get(e.userId);
    const rankChange = prevRank != null ? prevRank - e.rank : 0;
    return { ...e, rankChange };
  });

  const myRankChange = leaderboardWithChange.find((r) => r.userId === userId)?.rankChange ?? 0;

  res.status(200).json({
    totalHits,
    totalWithResult,
    precision,
    leaderboard: leaderboardWithChange,
    myRank,
    totalParticipants: companyUserIds.length,
    rankChange: myRankChange,
    pointsOverTime,
  });
});

app.post("/admin/sync-match-results", requireAdmin, async (_req, res) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!apiKey) {
    res.status(400).json({
      error: "missing_config",
      message: "Agregá FOOTBALL_DATA_API_KEY en server/.env. Obtené una gratis en https://www.football-data.org/",
    });
    return;
  }

  try {
    const [apiMatches, ourMatches] = await Promise.all([
      fetchWorldCupMatches(apiKey),
      prisma.match.findMany({
        select: { id: true, teamA: true, teamB: true, kickoffAt: true },
      }),
    ]);

    let updated = 0;
    for (const apiMatch of apiMatches) {
      const ourMatch = findMatchingOurMatch(apiMatch, ourMatches);
      if (!ourMatch) continue;

      const scores = mapScoreToOurMatch(apiMatch, ourMatch);
      if (!scores) continue;

      await prisma.match.update({
        where: { id: ourMatch.id },
        data: { resultScoreA: scores.scoreA, resultScoreB: scores.scoreB },
      });
      updated++;
    }

    res.status(200).json({
      ok: true,
      updated,
      totalApi: apiMatches.length,
      message: `Se actualizaron ${updated} resultados desde football-data.org`,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("POST /admin/sync-match-results error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      error: "sync_error",
      message: msg,
    });
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

app.get("/admin/stats", requireAdmin, async (req, res) => {
  const { companyId } = (req as AuthedRequest).auth;

  const [totalUsers, totalLogins, totalPrompts, totalPredictions] = await Promise.all([
    prisma.user.count({ where: { companyId, status: "active" } }),
    prisma.loginEvent.count({
      where: { user: { companyId } },
    }),
    prisma.promptLog.count({
      where: { user: { companyId } },
    }),
    prisma.prediction.count({
      where: { user: { companyId } },
    }),
  ]);

  const promptsPerUser = totalUsers > 0 ? (totalPrompts / totalUsers).toFixed(1) : "0";

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
  const { companyId } = (req as AuthedRequest).auth;
  const users = await prisma.user.findMany({
    where: { companyId },
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

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      role: role ?? "employee",
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
  const { companyId } = (req as AuthedRequest).auth;

  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, email: true, fullName: true, role: true },
  });

  const metrics = await Promise.all(
    users.map(async (u) => {
      const [logins, prompts, predictions] = await Promise.all([
        prisma.loginEvent.count({ where: { userId: u.id } }),
        prisma.promptLog.count({ where: { userId: u.id } }),
        prisma.prediction.count({ where: { userId: u.id } }),
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
  const { companyId } = (req as AuthedRequest).auth;

  type Row = { d: Date; c: bigint };
  const usersByDay = await prisma.$queryRaw<Row[]>`
    SELECT date_trunc('day', "createdAt")::date as d, count(*)::bigint as c
    FROM "User"
    WHERE "companyId" = ${companyId}
    GROUP BY date_trunc('day', "createdAt")::date
    ORDER BY d
  `;
  const promptsByDay = await prisma.$queryRaw<Row[]>`
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
  const { companyId } = (req as AuthedRequest).auth;

  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, email: true },
  });
  const userIds = users.map((u) => u.id);
  const userMap = new Map(users.map((u) => [u.id, u.email]));

  const logs = await prisma.promptLog.findMany({
    where: { userId: { in: userIds } },
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
  res.setHeader("Content-Disposition", "attachment; filename=prompts.csv");
  res.status(200).send("\uFEFF" + csv);
});

app.get("/admin/exports/logins.csv", requireAdmin, async (req, res) => {
  const { companyId } = (req as AuthedRequest).auth;

  const users = await prisma.user.findMany({
    where: { companyId },
    select: { id: true, email: true },
  });
  const userIds = users.map((u) => u.id);
  const userMap = new Map(users.map((u) => [u.id, u.email]));

  const events = await prisma.loginEvent.findMany({
    where: { userId: { in: userIds } },
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
  res.setHeader("Content-Disposition", "attachment; filename=logins.csv");
  res.status(200).send("\uFEFF" + csv);
});

app.get("/admin/exports/users.csv", requireAdmin, async (req, res) => {
  const { companyId } = (req as AuthedRequest).auth;

  const users = await prisma.user.findMany({
    where: { companyId },
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
  res.setHeader("Content-Disposition", "attachment; filename=users.csv");
  res.status(200).send("\uFEFF" + csv);
});

app.get("/me", requireAuth, async (req, res) => {
  const { userId } = (req as AuthedRequest).auth;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, role: true, status: true, companyId: true, createdAt: true },
  });
  if (!user) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(200).json({ user });
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

  const user = await prisma.user.update({
    where: { id: userId },
    data: updates,
    select: { id: true, email: true, fullName: true, role: true, status: true, companyId: true, createdAt: true },
  });
  res.status(200).json({ user });
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
    res.status(500).json({ error: "server_error", message: err instanceof Error ? err.message : "Error" });
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
    res.status(500).json({ error: "server_error", message: err instanceof Error ? err.message : "Error" });
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
    res.status(500).json({ error: "server_error", message: err instanceof Error ? err.message : "Error" });
  }
});

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
});

