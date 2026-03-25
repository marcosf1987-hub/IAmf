-- AlterTable
ALTER TABLE "PromptLog" ADD COLUMN "batchId" TEXT;

-- CreateIndex
CREATE INDEX "PromptLog_userId_batchId_idx" ON "PromptLog"("userId", "batchId");
