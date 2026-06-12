import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuthedRequest } from "./auth";
import { requireAuth } from "./auth";
import { makeRequireCompanyDiscipline } from "./company-competition-scope";
import { parseAiF1Top10Placements } from "./ai-parse";
import { chat } from "./ai-provider";
import {
  buildF1Top10Prompt,
  F1_PROMPT_LOG_SIGNATURE,
  validateF1Top10AgainstRoster,
} from "./f1-ai-generate";
import {
  aggregateF1PointsByUser,
  normalizePlacements,
  officialTop10DriverNumbers,
  scoreF1Placements,
} from "./f1-scoring";
import { decrypt } from "./crypto-util";
import { loadF1RacesForScoring } from "./f1-competition-leaderboard";
import { fetchOpenF1DriversForSession, syncF1FinishedRaceResults, syncF1SeasonRaces } from "./openf1-sync";
import { z } from "zod";

const f1PlacementsBodySchema = z.object({
  placements: z.array(z.union([z.number().int().min(1).max(99), z.null()])).length(10),
});

const f1GuidelineBodySchema = z.object({
  sessionKey: z.union([z.number().int(), z.string().regex(/^\d+$/)]),
  text: z.string().max(20_000),
});

function routeRaceId(req: Request): string | undefined {
  const raw = req.params.raceId;
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

function readF1GuidelinesMap(raw: Prisma.JsonValue): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function isF1PredictionWindowClosed(raceStartAt: Date): boolean {
  return Date.now() >= raceStartAt.getTime() - 60 * 60 * 1000;
}

export function registerF1Routes(app: Express, prisma: PrismaClient): void {
  const requireF1Discipline = makeRequireCompanyDiscipline(prisma, "f1");

  app.get("/public/f1/races", async (req, res) => {
    try {
      const yearRaw = req.query.year;
      const year =
        yearRaw !== undefined && yearRaw !== "" ? parseInt(String(yearRaw), 10) : new Date().getUTCFullYear();
      const limitRaw = req.query.limit;
      const limit = Math.min(
        40,
        Math.max(1, limitRaw !== undefined && limitRaw !== "" ? parseInt(String(limitRaw), 10) : 12)
      );
      const now = new Date();
      const races = await prisma.f1Race.findMany({
        where: { year: Number.isFinite(year) ? year : new Date().getUTCFullYear() },
        orderBy: { raceStartAt: "asc" },
        take: 80,
        select: {
          id: true,
          sessionKey: true,
          year: true,
          roundOrder: true,
          circuitShortName: true,
          countryName: true,
          raceStartAt: true,
          resultTop10: true,
        },
      });
      const upcoming = races.filter((r) => r.raceStartAt >= now).slice(0, limit);
      res.setHeader("Cache-Control", "public, max-age=120");
      res.status(200).json({
        races: upcoming.map((r) => ({
          id: r.id,
          sessionKey: r.sessionKey,
          year: r.year,
          roundOrder: r.roundOrder,
          circuitShortName: r.circuitShortName,
          countryName: r.countryName,
          raceStartAt: r.raceStartAt.toISOString(),
          hasResult: r.resultTop10 != null,
        })),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("GET /public/f1/races:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/public/f1/drivers", async (req, res) => {
    try {
      const raw = req.query.session_key;
      const sk = raw !== undefined && raw !== "" ? parseInt(String(raw), 10) : NaN;
      if (!Number.isFinite(sk)) {
        res.status(400).json({ error: "invalid_session_key" });
        return;
      }
      const race = await prisma.f1Race.findUnique({
        where: { sessionKey: sk },
        select: { meetingKey: true },
      });
      const list = await fetchOpenF1DriversForSession(sk, race?.meetingKey ?? null);
      res.setHeader("Cache-Control", "public, max-age=300");
      res.status(200).json({
        drivers: list.map((d) => ({ driverNumber: d.driverNumber, name: d.label })),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("GET /public/f1/drivers:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/f1/races", requireAuth, requireF1Discipline, async (_req, res) => {
    try {
      const races = await prisma.f1Race.findMany({
        orderBy: [{ year: "desc" }, { raceStartAt: "asc" }],
        select: {
          id: true,
          sessionKey: true,
          year: true,
          roundOrder: true,
          circuitShortName: true,
          countryName: true,
          raceStartAt: true,
          resultTop10: true,
        },
      });
      res.status(200).json({
        races: races.map((r) => {
          const official = officialTop10DriverNumbers(r.resultTop10);
          const officialOk = official.length === 10 && official.every((n) => n > 0);
          return {
            id: r.id,
            sessionKey: r.sessionKey,
            year: r.year,
            roundOrder: r.roundOrder,
            circuitShortName: r.circuitShortName,
            countryName: r.countryName,
            raceStartAt: r.raceStartAt.toISOString(),
            hasResult: r.resultTop10 != null,
            officialTop10: officialOk ? official : null,
          };
        }),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("GET /f1/races:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/f1/me/predictions", requireAuth, requireF1Discipline, async (req, res) => {
    const { userId } = (req as AuthedRequest).auth;
    try {
      const preds = await prisma.f1Prediction.findMany({
        where: { userId },
        include: {
          race: {
            select: {
              id: true,
              sessionKey: true,
              year: true,
              roundOrder: true,
              circuitShortName: true,
              countryName: true,
              raceStartAt: true,
              resultTop10: true,
            },
          },
        },
        orderBy: { race: { raceStartAt: "asc" } },
      });
      res.status(200).json({
        predictions: preds.map((p) => {
          const official = officialTop10DriverNumbers(p.race.resultTop10);
          const officialOk = official.length === 10 && official.every((n) => n > 0);
          return {
            id: p.id,
            raceId: p.raceId,
            placements: normalizePlacements(p.placements),
            race: {
              id: p.race.id,
              sessionKey: p.race.sessionKey,
              year: p.race.year,
              roundOrder: p.race.roundOrder,
              circuitShortName: p.race.circuitShortName,
              countryName: p.race.countryName,
              raceStartAt: p.race.raceStartAt.toISOString(),
              hasResult: p.race.resultTop10 != null,
              officialTop10: officialOk ? official : null,
            },
          };
        }),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("GET /f1/me/predictions:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  /** Prompts de generación top-10 F1 (mismo criterio que el texto enviado a la IA). */
  app.get("/f1/me/prompt-logs", requireAuth, requireF1Discipline, async (req, res) => {
    const { userId } = (req as AuthedRequest).auth;
    try {
      const logs = await prisma.promptLog.findMany({
        where: {
          userId,
          OR: [
            { promptText: { contains: F1_PROMPT_LOG_SIGNATURE } },
            { promptText: { contains: "Eres un analista de Fórmula 1" } },
            { promptText: { contains: "Laboratorio F1" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 80,
        select: {
          id: true,
          promptText: true,
          responseText: true,
          model: true,
          createdAt: true,
        },
      });
      res.status(200).json({
        prompts: logs.map((l) => ({
          id: l.id,
          promptText: l.promptText,
          responseText: l.responseText,
          model: l.model ?? "",
          createdAt: l.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("GET /f1/me/prompt-logs:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.put("/f1/predictions/:raceId", requireAuth, requireF1Discipline, async (req, res) => {
    const { userId } = (req as AuthedRequest).auth;
    const raceId = routeRaceId(req);
    if (!raceId) {
      res.status(400).json({ error: "invalid_race" });
      return;
    }
    const parsed = f1PlacementsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    try {
      const race = await prisma.f1Race.findUnique({ where: { id: raceId } });
      if (!race) {
        res.status(404).json({ error: "race_not_found" });
        return;
      }
      const placements = parsed.data.placements as (number | null)[];
      const pred = await prisma.f1Prediction.upsert({
        where: { userId_raceId: { userId, raceId } },
        create: { userId, raceId, placements: placements as unknown as Prisma.InputJsonValue },
        update: { placements: placements as unknown as Prisma.InputJsonValue },
      });
      res.status(200).json({
        id: pred.id,
        raceId: pred.raceId,
        placements: normalizePlacements(pred.placements),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("PUT /f1/predictions/:raceId:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/f1/predictions/:raceId/generate-ai", requireAuth, requireF1Discipline, async (req, res) => {
    const { userId, companyId } = (req as AuthedRequest).auth;
    const raceId = routeRaceId(req);
    if (!raceId) {
      res.status(400).json({ error: "invalid_race" });
      return;
    }
    try {
      const race = await prisma.f1Race.findUnique({ where: { id: raceId } });
      if (!race) {
        res.status(404).json({ error: "race_not_found" });
        return;
      }
      if (isF1PredictionWindowClosed(race.raceStartAt)) {
        res.status(400).json({
          error: "race_locked",
        });
        return;
      }

      const gRow = await prisma.prodeGuidelines.findUnique({
        where: { userId },
        select: { f1RaceGuidelines: true },
      });
      const map = readF1GuidelinesMap(gRow?.f1RaceGuidelines ?? {});
      const pautas = (map[String(race.sessionKey)] ?? "").trim();
      if (!pautas) {
        res.status(400).json({
          error: "f1_guidelines_required",
          message:
            "No hay pautas F1 guardadas para esta carrera en el Laboratorio (misma session_key). Guardá el texto en /app/f1/laboratorio antes de generar con IA.",
        });
        return;
      }

      const drivers = await fetchOpenF1DriversForSession(race.sessionKey, race.meetingKey);
      const allowed = new Set(drivers.map((d) => d.driverNumber));

      const aiConfig = await prisma.aiConfig.findUnique({ where: { companyId } });
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
          /* decrypt falló: se usará env en chat() si aplica */
        }
      }

      const prompt = buildF1Top10Prompt({
        pautas,
        circuitShortName: race.circuitShortName,
        countryName: race.countryName,
        roundOrder: race.roundOrder,
        raceStartAtIso: race.raceStartAt.toISOString(),
        drivers,
      });

      const result = await chat(prompt, chatConfig);
      const batchId = randomUUID();
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

      const nums = parseAiF1Top10Placements(result.text);
      if (!nums || !validateF1Top10AgainstRoster(nums, allowed)) {
        res.status(422).json({
          error: "ai_parse_failed",
          message:
            "La IA no devolvió 10 dorsales válidos y únicos de la parrilla (o el JSON no se pudo leer). Reintentá o ajustá las pautas en el Laboratorio F1.",
        });
        return;
      }

      const placements = nums;
      const pred = await prisma.f1Prediction.upsert({
        where: { userId_raceId: { userId, raceId } },
        create: { userId, raceId, placements: placements as unknown as Prisma.InputJsonValue },
        update: { placements: placements as unknown as Prisma.InputJsonValue },
      });

      res.status(200).json({
        id: pred.id,
        raceId: pred.raceId,
        placements: normalizePlacements(pred.placements),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("POST /f1/predictions/:raceId/generate-ai:", err);
      // eslint-disable-next-line no-console
      console.error("F1 route error:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/f1/me/summary", requireAuth, requireF1Discipline, async (req, res) => {
    const { userId } = (req as AuthedRequest).auth;
    try {
      const races = await loadF1RacesForScoring(prisma);
      const preds = await prisma.f1Prediction.findMany({
        where: { userId },
        select: { raceId: true, placements: true },
      });
      let total = 0;
      const byRace: {
        raceId: string;
        sessionKey: number;
        label: string;
        points: number;
      }[] = [];
      for (const r of races) {
        const official = officialTop10DriverNumbers(r.resultTop10);
        if (official.length < 10) continue;
        const pr = preds.find((p) => p.raceId === r.id);
        if (!pr) continue;
        const pts = scoreF1Placements(normalizePlacements(pr.placements), official);
        total += pts;
        byRace.push({
          raceId: r.id,
          sessionKey: r.sessionKey,
          label: r.circuitShortName ? `R${r.roundOrder} · ${r.circuitShortName}` : `R${r.roundOrder}`,
          points: pts,
        });
      }
      res.status(200).json({ totalPoints: total, byRace });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("GET /f1/me/summary:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.get("/f1/me/guidelines", requireAuth, requireF1Discipline, async (req, res) => {
    const { userId } = (req as AuthedRequest).auth;
    try {
      const g = await prisma.prodeGuidelines.findUnique({ where: { userId } });
      const map = readF1GuidelinesMap(g?.f1RaceGuidelines ?? {});
      res.status(200).json({ bySessionKey: map });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("GET /f1/me/guidelines:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.put("/f1/me/guidelines", requireAuth, requireF1Discipline, async (req, res) => {
    const { userId } = (req as AuthedRequest).auth;
    const parsed = f1GuidelineBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const sk =
      typeof parsed.data.sessionKey === "number"
        ? String(parsed.data.sessionKey)
        : String(parseInt(parsed.data.sessionKey as string, 10));
    try {
      const existing = await prisma.prodeGuidelines.findUnique({ where: { userId } });
      const prev = readF1GuidelinesMap(existing?.f1RaceGuidelines ?? {});
      prev[sk] = parsed.data.text;
      await prisma.prodeGuidelines.upsert({
        where: { userId },
        create: {
          userId,
          textGroups: "",
          textRoundOf32: "",
          textKnockout: "",
          f1RaceGuidelines: prev as Prisma.InputJsonValue,
        },
        update: { f1RaceGuidelines: prev as Prisma.InputJsonValue },
      });
      res.status(200).json({ bySessionKey: prev });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("PUT /f1/me/guidelines:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/f1/admin/sync-openf1", requireAuth, async (req, res) => {
    const { role } = (req as AuthedRequest).auth;
    if (role !== "super_admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const y2025 = await syncF1SeasonRaces(prisma, 2025);
      const y2026 = await syncF1SeasonRaces(prisma, 2026);
      const results = await syncF1FinishedRaceResults(prisma);
      res.status(200).json({ upserted2025: y2025, upserted2026: y2026, resultsSynced: results });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("POST /f1/admin/sync-openf1:", err);
      // eslint-disable-next-line no-console
      console.error("F1 route error:", err);
      res.status(500).json({ error: "server_error" });
    }
  });
}
