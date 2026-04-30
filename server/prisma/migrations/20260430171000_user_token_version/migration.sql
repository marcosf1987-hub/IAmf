-- PR4 security: token version for session revocation
ALTER TABLE "User"
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

