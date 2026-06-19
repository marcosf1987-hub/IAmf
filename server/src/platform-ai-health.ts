import type { PrismaClient } from "@prisma/client";
import type { AdminDateRange } from "./admin-date-range";

export type AiBatchStatus = "ok" | "partial" | "failed";

export type PlatformAiHealthBatchRow = {
  batchId: string;
  userId: string;
  userEmail: string;
  createdAt: string;
  promptCount: number;
  savedCount: number;
  status: AiBatchStatus;
  phaseLabel: string | null;
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
  const savedGroups =
    batchIds.length === 0
      ? []
      : await prisma.predictionHistory.groupBy({
          by: ["batchId"],
          where: {
            source: "ai",
            batchId: { in: batchIds },
            kind: "match",
          },
          _count: { _all: true },
        });

  const phaseRows =
    batchIds.length === 0
      ? []
      : await prisma.predictionHistory.findMany({
          where: {
            batchId: { in: batchIds },
            source: "ai",
            phaseLabel: { not: null },
          },
          select: { batchId: true, phaseLabel: true },
          distinct: ["batchId"],
        });

  const savedByBatch = new Map(
    savedGroups.map((g) => [g.batchId!, g._count._all])
  );
  const phaseByBatch = new Map(
    phaseRows.map((r) => [r.batchId!, r.phaseLabel])
  );

  let ok = 0;
  let partial = 0;
  let failed = 0;
  const allRows: PlatformAiHealthBatchRow[] = [];

  for (const [batchId, meta] of batchMeta) {
    const savedCount = savedByBatch.get(batchId) ?? 0;
    const status = classifyAiBatch(meta.promptCount, savedCount);
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
      status,
      phaseLabel: phaseByBatch.get(batchId) ?? null,
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
