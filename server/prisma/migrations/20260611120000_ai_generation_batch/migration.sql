-- CreateTable
CREATE TABLE "AiGenerationBatch" (
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phaseLabel" TEXT,
    "requested" INTEGER NOT NULL,
    "parsed" INTEGER NOT NULL,
    "saved" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "diagnostics" JSONB NOT NULL,

    CONSTRAINT "AiGenerationBatch_pkey" PRIMARY KEY ("batchId")
);

-- CreateIndex
CREATE INDEX "AiGenerationBatch_userId_idx" ON "AiGenerationBatch"("userId");

-- CreateIndex
CREATE INDEX "AiGenerationBatch_createdAt_idx" ON "AiGenerationBatch"("createdAt");

-- AddForeignKey
ALTER TABLE "AiGenerationBatch" ADD CONSTRAINT "AiGenerationBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
