-- CreateTable
CREATE TABLE "CompetitionInvitation" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "CompetitionInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionInvitation_tokenHash_key" ON "CompetitionInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "CompetitionInvitation_competitionId_idx" ON "CompetitionInvitation"("competitionId");

-- CreateIndex
CREATE INDEX "CompetitionInvitation_email_idx" ON "CompetitionInvitation"("email");

-- AddForeignKey
ALTER TABLE "CompetitionInvitation" ADD CONSTRAINT "CompetitionInvitation_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionInvitation" ADD CONSTRAINT "CompetitionInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
