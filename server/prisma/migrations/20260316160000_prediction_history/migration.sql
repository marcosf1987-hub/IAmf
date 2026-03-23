-- CreateEnum
CREATE TYPE "PredictionHistoryKind" AS ENUM ('match', 'champion');

-- CreateTable
CREATE TABLE "PredictionHistory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "kind" "PredictionHistoryKind" NOT NULL,
    "matchId" TEXT,
    "scoreA" INTEGER,
    "scoreB" INTEGER,
    "champion" TEXT,
    "runnerUp" TEXT,
    "source" TEXT NOT NULL,
    "batchId" TEXT,
    "phaseLabel" TEXT,

    CONSTRAINT "PredictionHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PredictionHistory" ADD CONSTRAINT "PredictionHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PredictionHistory" ADD CONSTRAINT "PredictionHistory_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PredictionHistory_userId_createdAt_idx" ON "PredictionHistory"("userId", "createdAt" DESC);

CREATE INDEX "PredictionHistory_batchId_idx" ON "PredictionHistory"("batchId");
