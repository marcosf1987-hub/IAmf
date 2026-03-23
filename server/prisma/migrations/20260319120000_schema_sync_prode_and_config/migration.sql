-- Sincroniza la BD con el schema actual (tablas y columnas que no estaban en init).

-- Valores extra del enum MatchStage (init solo tenía group, roundOf16, quarterFinal, semiFinal, final)
DO $$ BEGIN
  ALTER TYPE "MatchStage" ADD VALUE 'roundOf32';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "MatchStage" ADD VALUE 'thirdPlace';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Resultados de partidos en Match
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "resultScoreA" INTEGER;
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "resultScoreB" INTEGER;

-- Índice único en Company.name (requerido por Prisma @unique)
CREATE UNIQUE INDEX IF NOT EXISTS "Company_name_key" ON "Company"("name");

-- CompanyConfig
CREATE TABLE IF NOT EXISTS "CompanyConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "anonymizationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CompanyConfig_companyId_key" ON "CompanyConfig"("companyId");

DO $$ BEGIN
  ALTER TABLE "CompanyConfig" ADD CONSTRAINT "CompanyConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AiConfig
CREATE TABLE IF NOT EXISTS "AiConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "baseUrl" TEXT,
    "apiKeyEnc" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiConfig_companyId_key" ON "AiConfig"("companyId");

DO $$ BEGIN
  ALTER TABLE "AiConfig" ADD CONSTRAINT "AiConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ProdeGuidelines
CREATE TABLE IF NOT EXISTS "ProdeGuidelines" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdeGuidelines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProdeGuidelines_userId_key" ON "ProdeGuidelines"("userId");

DO $$ BEGIN
  ALTER TABLE "ProdeGuidelines" ADD CONSTRAINT "ProdeGuidelines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ProdeChampionPrediction
CREATE TABLE IF NOT EXISTS "ProdeChampionPrediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "champion" TEXT NOT NULL,
    "runnerUp" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdeChampionPrediction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProdeChampionPrediction_userId_key" ON "ProdeChampionPrediction"("userId");

DO $$ BEGIN
  ALTER TABLE "ProdeChampionPrediction" ADD CONSTRAINT "ProdeChampionPrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
