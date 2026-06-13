ALTER TABLE "WorkOrder"
  ADD COLUMN "actualHours" DOUBLE PRECISION,
  ADD COLUMN "requiredSpecialty" TEXT,
  ADD COLUMN "metadata" JSONB;
