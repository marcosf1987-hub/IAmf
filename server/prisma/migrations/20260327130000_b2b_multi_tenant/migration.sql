-- Enum UserRole: employee/admin -> super_admin/org_admin/member
CREATE TYPE "UserRole_new" AS ENUM ('super_admin', 'org_admin', 'member');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE "role"::text
    WHEN 'admin' THEN 'org_admin'::"UserRole_new"
    WHEN 'employee' THEN 'member'::"UserRole_new"
    ELSE 'member'::"UserRole_new"
  END
);

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'member'::"UserRole";

-- Company: nombre ya no único; slug único; cupos y Stripe
ALTER TABLE "Company" DROP CONSTRAINT IF EXISTS "Company_name_key";

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "seatLimit" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;

UPDATE "Company" SET "slug" = 'demo' WHERE "name" = 'DemoCompany' AND ("slug" IS NULL OR "slug" = '');
UPDATE "Company" SET "slug" = 'org-' || "id" WHERE "slug" IS NULL OR "slug" = '';

ALTER TABLE "Company" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- Invitaciones B2B
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

CREATE INDEX "Invitation_companyId_idx" ON "Invitation"("companyId");

CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
