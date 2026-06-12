import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { getMailStatus } from "./mail";
import { getOAuthConfigJson } from "./oauth";

export type SystemHealthCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
};

export type SystemHealthPayload = {
  ok: boolean;
  checkedAt: string;
  uptimeSeconds: number;
  environment: string;
  checks: SystemHealthCheck[];
  migrations: {
    applied: number;
    expected: number;
    pending: string[];
    migrationFilesReadable: boolean;
  };
};

async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function columnExists(
  prisma: PrismaClient,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

function listExpectedMigrations(): { names: string[]; readable: boolean } {
  try {
    const dir = join(__dirname, "../prisma/migrations");
    const names = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    return { names, readable: true };
  } catch {
    return { names: [], readable: false };
  }
}

async function listAppliedMigrations(prisma: PrismaClient): Promise<string[]> {
  try {
    const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY migration_name
    `;
    return rows.map((r) => r.migration_name);
  } catch {
    return [];
  }
}

export async function buildSystemHealth(prisma: PrismaClient): Promise<SystemHealthPayload> {
  const checks: SystemHealthCheck[] = [];

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ id: "database", label: "Base de datos", ok: true, detail: "Conexión OK" });
  } catch {
    checks.push({
      id: "database",
      label: "Base de datos",
      ok: false,
      detail: "Sin conexión (revisá DATABASE_URL y el servicio Postgres)",
    });
  }

  const { names: expected, readable: migrationFilesReadable } = listExpectedMigrations();
  const applied = await listAppliedMigrations(prisma);
  const pending = migrationFilesReadable ? expected.filter((m) => !applied.includes(m)) : [];

  checks.push({
    id: "migrations",
    label: "Migraciones Prisma",
    ok: pending.length === 0 && applied.length > 0,
    detail: !migrationFilesReadable
      ? `${applied.length} aplicadas (no se pudo leer carpeta local de migraciones)`
      : pending.length === 0
        ? `${applied.length}/${expected.length} aplicadas`
        : `Pendientes: ${pending.join(", ")}`,
  });

  const platform = await prisma.company.findUnique({
    where: { slug: "platform-internal" },
    select: { id: true },
  });
  checks.push({
    id: "platform_company",
    label: "Empresa platform-internal",
    ok: Boolean(platform),
    detail: platform ? "OK" : "Falta — ejecutá prisma db seed",
  });

  checks.push({
    id: "jwt_secret",
    label: "JWT_SECRET",
    ok: Boolean(process.env.JWT_SECRET?.trim()),
    detail: process.env.JWT_SECRET?.trim() ? "Definida" : "Falta en variables del backend",
  });

  let matchCount = 0;
  try {
    matchCount = await prisma.match.count();
  } catch {
    matchCount = 0;
  }
  checks.push({
    id: "matches_seed",
    label: "Partidos del Mundial",
    ok: matchCount > 0,
    detail: matchCount > 0 ? `${matchCount} partidos` : "Base vacía — ejecutá prisma db seed",
  });

  let predictionHistoryOk = false;
  try {
    predictionHistoryOk = await tableExists(prisma, "PredictionHistory");
  } catch {
    predictionHistoryOk = false;
  }
  checks.push({
    id: "prediction_history",
    label: "Tabla PredictionHistory",
    ok: predictionHistoryOk,
    detail: predictionHistoryOk ? "OK" : "Falta migración 20260316160000_prediction_history",
  });

  let hiddenColOk = false;
  try {
    hiddenColOk = await columnExists(prisma, "User", "hiddenFromRankings");
  } catch {
    hiddenColOk = false;
  }
  checks.push({
    id: "hidden_from_rankings",
    label: "User.hiddenFromRankings",
    ok: hiddenColOk,
    detail: hiddenColOk ? "OK" : "Falta migración 20260612040000_user_hidden_from_rankings",
  });

  const mail = getMailStatus();
  checks.push({
    id: "mail",
    label: "Correo transaccional",
    ok: mail.configured,
    detail: mail.configured ? `Proveedor: ${mail.provider}` : (mail.hint ?? "Sin configurar"),
  });

  const oauth = getOAuthConfigJson();
  checks.push({
    id: "oauth_google",
    label: "Google OAuth",
    ok: oauth.google,
    detail: oauth.google
      ? "OK"
      : `Faltan: ${[
          !oauth.oauthPublicBaseSet && "URL pública del API",
          !oauth.googleClientIdSet && "Client ID",
          !oauth.googleClientSecretSet && "Client secret",
        ]
          .filter(Boolean)
          .join(", ") || "variables OAuth"}`,
  });

  checks.push({
    id: "football_data_api",
    label: "FOOTBALL_DATA_API_KEY",
    ok: Boolean(process.env.FOOTBALL_DATA_API_KEY?.trim()),
    detail: process.env.FOOTBALL_DATA_API_KEY?.trim()
      ? "Definida"
      : "Falta para sync de resultados",
  });

  checks.push({
    id: "openai_api",
    label: "OPENAI_API_KEY",
    ok: Boolean(process.env.OPENAI_API_KEY?.trim()),
    detail: process.env.OPENAI_API_KEY?.trim() ? "Definida" : "Falta para predicciones con IA",
  });

  const frontendUrl = process.env.FRONTEND_URL?.trim();
  checks.push({
    id: "frontend_url",
    label: "FRONTEND_URL",
    ok: Boolean(frontendUrl),
    detail: frontendUrl ?? "Falta para OAuth callback y enlaces por email",
  });

  const ok = checks.every((c) => c.ok);

  return {
    ok,
    checkedAt: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV ?? "development",
    checks,
    migrations: {
      applied: applied.length,
      expected: expected.length,
      pending,
      migrationFilesReadable,
    },
  };
}
