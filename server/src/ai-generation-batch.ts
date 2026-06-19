import type { Prisma, PrismaClient } from "@prisma/client";

export type ProdeAiScopeStatus = "ok" | "partial" | "parse_failed" | "ai_error";

export type ProdeAiScopeDiagnostic = {
  scopeLabel: string;
  requested: number;
  parsed: number;
  saved: number;
  status: ProdeAiScopeStatus;
  errors: string[];
};

export type ProdeAiBatchDiagnostics = {
  batchId: string;
  requested: number;
  parsed: number;
  saved: number;
  status: ProdeAiScopeStatus;
  scopes: ProdeAiScopeDiagnostic[];
};

export function finalizeProdeScopeStatus(d: ProdeAiScopeDiagnostic): ProdeAiScopeStatus {
  if (d.errors.some((e) => e.startsWith("ai_error"))) return "ai_error";
  if (d.saved === 0 && d.requested > 0) return d.parsed > 0 ? "partial" : "parse_failed";
  if (d.saved < d.requested) return "partial";
  return "ok";
}

export function computeProdeBatchOverallStatus(scopes: ProdeAiScopeDiagnostic[]): ProdeAiScopeStatus {
  const requested = scopes.reduce((n, d) => n + d.requested, 0);
  const parsed = scopes.reduce((n, d) => n + d.parsed, 0);
  const saved = scopes.reduce((n, d) => n + d.saved, 0);
  const allErrors = scopes.flatMap((d) => d.errors);
  if (allErrors.some((e) => e.startsWith("ai_error"))) return "ai_error";
  if (saved === 0 && requested > 0) return parsed > 0 ? "partial" : "parse_failed";
  if (saved < requested) return "partial";
  return "ok";
}

export function summarizeProdeBatchErrors(scopes: ProdeAiScopeDiagnostic[]): string | null {
  const errors = scopes.flatMap((s) => s.errors);
  if (errors.length === 0) return null;
  return errors.slice(0, 3).join(" · ");
}

export async function persistProdeAiGenerationBatch(
  prisma: PrismaClient,
  data: {
    batchId: string;
    userId: string;
    phaseLabel: string | null;
    scopes: ProdeAiScopeDiagnostic[];
  }
): Promise<void> {
  const requested = data.scopes.reduce((n, d) => n + d.requested, 0);
  const parsed = data.scopes.reduce((n, d) => n + d.parsed, 0);
  const saved = data.scopes.reduce((n, d) => n + d.saved, 0);
  const status = computeProdeBatchOverallStatus(data.scopes);
  const diagnostics: ProdeAiBatchDiagnostics = {
    batchId: data.batchId,
    requested,
    parsed,
    saved,
    status,
    scopes: data.scopes,
  };

  const firstPrompt = await prisma.promptLog.findFirst({
    where: { batchId: data.batchId },
    orderBy: { createdAt: "asc" },
    select: { provider: true, model: true },
  });

  const payload = {
    userId: data.userId,
    phaseLabel: data.phaseLabel,
    requested,
    parsed,
    saved,
    status,
    provider: firstPrompt?.provider ?? null,
    model: firstPrompt?.model ?? null,
    diagnostics: diagnostics as unknown as Prisma.InputJsonValue,
  };

  await prisma.aiGenerationBatch.upsert({
    where: { batchId: data.batchId },
    create: { batchId: data.batchId, ...payload },
    update: payload,
  });
}

export function parseStoredProdeBatchDiagnostics(
  raw: Prisma.JsonValue
): ProdeAiBatchDiagnostics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.batchId !== "string" || !Array.isArray(o.scopes)) return null;
  return raw as ProdeAiBatchDiagnostics;
}
