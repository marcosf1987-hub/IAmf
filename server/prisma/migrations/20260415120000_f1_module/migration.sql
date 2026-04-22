-- CreateEnum
CREATE TYPE "CompetitionDiscipline" AS ENUM ('football', 'f1');

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "discipline" "CompetitionDiscipline" NOT NULL DEFAULT 'football';

-- AlterTable
ALTER TABLE "ProdeGuidelines" ADD COLUMN "f1RaceGuidelines" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "F1Race" (
    "id" TEXT NOT NULL,
    "sessionKey" INTEGER NOT NULL,
    "meetingKey" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "roundOrder" INTEGER NOT NULL DEFAULT 0,
    "sessionName" TEXT NOT NULL,
    "circuitShortName" TEXT,
    "countryName" TEXT,
    "raceStartAt" TIMESTAMP(3) NOT NULL,
    "resultTop10" JSONB,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "F1Race_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "F1Race_sessionKey_key" ON "F1Race"("sessionKey");

CREATE INDEX "F1Race_year_raceStartAt_idx" ON "F1Race"("year", "raceStartAt");

-- CreateTable
CREATE TABLE "F1Prediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "placements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "F1Prediction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "F1Prediction_userId_raceId_key" ON "F1Prediction"("userId", "raceId");

CREATE INDEX "F1Prediction_raceId_idx" ON "F1Prediction"("raceId");

ALTER TABLE "F1Prediction" ADD CONSTRAINT "F1Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "F1Prediction" ADD CONSTRAINT "F1Prediction_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "F1Race"("id") ON DELETE CASCADE ON UPDATE CASCADE;
