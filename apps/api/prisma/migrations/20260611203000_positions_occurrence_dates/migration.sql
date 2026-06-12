ALTER TABLE "MaintenanceTemplate"
ADD COLUMN "estimatedHours" DOUBLE PRECISION,
ADD COLUMN "idempotencyHash" TEXT;

UPDATE "MaintenanceTemplate"
SET "idempotencyHash" = "sourceHash"
WHERE "idempotencyHash" IS NULL;

ALTER TABLE "MaintenanceTemplate"
ALTER COLUMN "idempotencyHash" SET NOT NULL;

CREATE UNIQUE INDEX
"MaintenanceTemplate_idempotencyHash_key"
ON "MaintenanceTemplate"("idempotencyHash");

ALTER TABLE "MaintenanceOccurrence"
ALTER COLUMN "scheduledFor" TYPE DATE
USING "scheduledFor"::date;

ALTER TABLE "MaintenanceOccurrence"
ADD COLUMN "dueDate" DATE,
ADD COLUMN "isHistorical" BOOLEAN NOT NULL DEFAULT false;

UPDATE "MaintenanceOccurrence"
SET "dueDate" = (
  date_trunc('month', "scheduledFor"::timestamp)
  + interval '1 month'
  - interval '1 day'
)::date
WHERE "dueDate" IS NULL;

ALTER TABLE "MaintenanceOccurrence"
ALTER COLUMN "dueDate" SET NOT NULL;

CREATE UNIQUE INDEX
"MaintenanceOccurrence_templateId_scheduledFor_key"
ON "MaintenanceOccurrence"("templateId", "scheduledFor");
