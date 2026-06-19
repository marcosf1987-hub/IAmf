import type { PrismaClient } from "@prisma/client";
import type { AdminDateRange } from "./admin-date-range";
import {
  parseStoredProdeBatchDiagnostics,
  summarizeProdeBatchErrors,
  type ProdeAiScopeDiagnostic,
  type ProdeAiScopeStatus,
} from "./ai-generation-batch";

export type AiBatchStatus = "ok" | "partial" | "failed";

export type PlatformAiHealthBatchRow = {
  batchId: string;
  userId: string;
  userEmail: string;
  createdAt: string;
  promptCount: number;
  savedCount: number;
  requested: number;
  parsed: number;
  status: AiBatchStatus;
  detailStatus: ProdeAiScopeStatus | null;
  phaseLabel: string | null;
  provider: string | null;
  model: string | null;
  errorSummary: string | null;
  scopes: ProdeAiScopeDiagnostic[] | null;
  hasPersistedDiagnostics: boolean;
};

export type PlatformAiHealthPayload = {
  range: { from: string; to: string } | null;
  batches: {
    total: number;
    ok: number;
    partial: number;
    failed: number;
    successRate: number;
  };
  predictions: {
    savedViaAi: number;
    prodePrompts: number;
    usersWithAiGeneration: number;
  };
  recentBatches: PlatformAiHealthBatchRow[];
};

export function classifyAiBatch(promptCount: number, savedCount: number): AiBatchStatus {
  if (savedCount === 0) return "failed";
  if (promptCount > 1) return "partial";
  return "ok";
}

export function mapPersistedBatchStatus(
  detail: ProdeAiScopeStatus | null,
  promptCount: number,
  savedCount: number
): AiBatchStatus {
  if (detail === "ok") return "ok";
  if (detail === "partial") return "partial";
  if (detail === "parse_failed" || detail === "ai_error") return "failed";
  return classifyAiBatch(promptCount, savedCount);
}

export async function buildPlatformAiHealth(
  prisma: PrismaClient,
  range?: AdminDateRange
): Promise<PlatformAiHealthPayload> {
  const createdAt = range ? { gte: range.from, lte: range.to } : undefined;

  const prodePrompts = await prisma.promptLog.findMany({
    where: {
      batchId: { not: null },
      ...(createdAt ? { createdAt } : {}),
    },
    select: {
      batchId: true,
      userId: true,
      createdAt: true,
      user: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const batchMeta = new Map<
    string,
    { userId: string; userEmail: string; createdAt: Date; promptCount: number }
  >();

  for (const row of prodePrompts) {
    const id = row.batchId!;
    const existing = batchMeta.get(id);
    if (!existing) {
      batchMeta.set(id, {
        userId: row.userId,
        userEmail: row.user.email,
        createdAt: row.createdAt,
        promptCount: 1,
      });
    } else {
      existing.promptCount += 1;
      if (row.createdAt < existing.createdAt) {
        existing.createdAt = row.createdAt;
      }
    }
  }

  const batchIds = Array.from(batchMeta.keys());
  const [savedGroups, phaseRows, persistedBatches] = await Promise.all([
    batchIds.length === 0
      ? Promise.resolve([])
      : prisma.predictionHistory.groupBy({
          by: ["batchId"],
          where: {
            source: "ai",
            batchId: { in: batchIds },
            kind: "match",
          },
          _count: { _all: true },
        }),
    batchIds.length === 0
      ? Promise.resolve([])
      : prisma.predictionHistory.findMany({
          where: {
            batchId: { in: batchIds },
            source: "ai",
            phaseLabel: { not: null },
          },
          select: { batchId: true, phaseLabel: true },
          distinct: ["batchId"],
        }),
    batchIds.length === 0
      ? Promise.resolve([])
      : prisma.aiGenerationBatch.findMany({
          where: { batchId: { in: batchIds } },
        }),
  ]);

  const savedByBatch = new Map(
    savedGroups.map((g) => [g.batchId!, g._count._all])
  );
  const phaseByBatch = new Map(
    phaseRows.map((r) => [r.batchId!, r.phaseLabel])
  );
  const persistedByBatch = new Map(
    persistedBatches.map((b) => [b.batchId, b])
  );

  let ok = 0;
  let partial = 0;
  let failed = 0;
  const allRows: PlatformAiHealthBatchRow[] = [];

  for (const [batchId, meta] of batchMeta) {
    const persisted = persistedByBatch.get(batchId);
    const stored = persisted ? parseStoredProdeBatchDiagnostics(persisted.diagnostics) : null;
    const scopes = stored?.scopes ?? null;
    const savedCount = persisted?.saved ?? savedByBatch.get(batchId) ?? 0;
    const requested = persisted?.requested ?? 0;
    const parsed = persisted?.parsed ?? 0;
    const detailStatus = (persisted?.status as ProdeAiScopeStatus | undefined) ?? null;
    const status = mapPersistedBatchStatus(detailStatus, meta.promptCount, savedCount);
    if (status === "ok") ok += 1;
    else if (status === "partial") partial += 1;
    else failed += 1;

    allRows.push({
      batchId,
      userId: meta.userId,
      userEmail: meta.userEmail,
      createdAt: meta.createdAt.toISOString(),
      promptCount: meta.promptCount,
      savedCount,
      requested,
      parsed,
      status,
      detailStatus,
      phaseLabel: persisted?.phaseLabel ?? phaseByBatch.get(batchId) ?? null,
      provider: persisted?.provider ?? null,
      model: persisted?.model ?? null,
      errorSummary: scopes ? summarizeProdeBatchErrors(scopes) : null,
      scopes,
      hasPersistedDiagnostics: Boolean(persisted),
    });
  }

  allRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = allRows.length;
  const successRate = total > 0 ? Math.round(((ok + partial) / total) * 100) : 0;

  const usersWithAiGeneration = new Set(allRows.map((r) => r.userId)).size;

  const savedViaAi = savedGroups.reduce((n, g) => n + g._count._all, 0);

  return {
    range: range
      ? {
          from: range.from.toISOString().slice(0, 10),
          to: range.to.toISOString().slice(0, 10),
        }
      : null,
    batches: {
      total,
      ok,
      partial,
      failed,
      successRate,
    },
    predictions: {
      savedViaAi,
      prodePrompts: prodePrompts.length,
      usersWithAiGeneration,
    },
    recentBatches: allRows.slice(0, 20),
  };
}
