-- AlterTable
ALTER TABLE "Competition" ADD COLUMN "inviteCode" TEXT;
ALTER TABLE "Competition" ADD COLUMN "description" TEXT;
ALTER TABLE "Competition" ADD COLUMN "emoji" TEXT;
ALTER TABLE "Competition" ADD COLUMN "coverImageUrl" TEXT;

-- Códigos únicos para filas existentes
UPDATE "Competition" c
SET "inviteCode" = 'MUNDIAL-IA-' || upper(substr(md5(c.id::text || 'invite'), 1, 10));

ALTER TABLE "Competition" ALTER COLUMN "inviteCode" SET NOT NULL;

CREATE UNIQUE INDEX "Competition_inviteCode_key" ON "Competition"("inviteCode");
