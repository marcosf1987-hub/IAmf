-- CreateEnum
CREATE TYPE "CompanyCompetitionScope" AS ENUM ('football', 'f1', 'all');

-- AlterTable
ALTER TABLE "CompanyConfig" ADD COLUMN "competitionScope" "CompanyCompetitionScope" NOT NULL DEFAULT 'all';

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultCompetitionScope" "CompanyCompetitionScope" NOT NULL DEFAULT 'all',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformConfig" ("id", "defaultCompetitionScope", "updatedAt")
VALUES ('default', 'all', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
