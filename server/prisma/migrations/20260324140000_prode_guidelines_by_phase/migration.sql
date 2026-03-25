-- Pautas por fase: renombrar columna legacy y agregar etapas R32 y knockout
ALTER TABLE "ProdeGuidelines" RENAME COLUMN "text" TO "textGroups";

ALTER TABLE "ProdeGuidelines" ADD COLUMN "textRoundOf32" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProdeGuidelines" ADD COLUMN "textKnockout" TEXT NOT NULL DEFAULT '';
