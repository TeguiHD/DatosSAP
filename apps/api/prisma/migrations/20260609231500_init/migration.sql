-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'ADMIN', 'SUPERVISOR', 'TECNICO', 'CLIENTE_VIEWER');

-- CreateEnum
CREATE TYPE "PlantStatus" AS ENUM ('ACTIVE', 'STANDBY', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AssetNodeType" AS ENUM ('TECHNICAL_LOCATION', 'EQUIPMENT');

-- CreateEnum
CREATE TYPE "FrequencyCode" AS ENUM ('ONE_MONTH', 'SIX_MONTHS', 'ONE_YEAR', 'FIVE_YEARS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OccurrenceStatus" AS ENUM ('SCHEDULED', 'DUE_SOON', 'OVERDUE', 'CONVERTED_TO_WORK_ORDER', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_EVIDENCE', 'PENDING_SUPERVISOR_REVIEW', 'PENDING_CLIENT_APPROVAL', 'COMPLETED', 'CLOSED', 'SIGNED', 'REJECTED', 'REOPENED', 'POSTPONED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportFileType" AS ENUM ('KKS_FIORI', 'POSICIONES_ESSC_SUR', 'PLANES_MANTENCION');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('UPLOADED', 'MAPPED', 'DRY_RUN_READY', 'BLOCKED', 'APPLYING', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TECNICO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "PlantStatus" NOT NULL DEFAULT 'ACTIVE',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "healthScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantAlias" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "aliasCode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlantAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlantScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPlantScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCenter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Personnel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "weeklyCapacityHours" DOUBLE PRECISION NOT NULL DEFAULT 45,
    "primarySpecialtyId" TEXT,
    "workCenterId" TEXT,

    CONSTRAINT "Personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetKksNode" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "parentId" TEXT,
    "nodeType" "AssetNodeType" NOT NULL,
    "technicalObject" TEXT NOT NULL,
    "superiorObject" TEXT,
    "kks" TEXT,
    "kksDescription" TEXT,
    "equipmentCode" TEXT,
    "equipmentDescription" TEXT,
    "planningGroup" TEXT,
    "site" TEXT,
    "systemStatus" TEXT,
    "center" TEXT,
    "workCenterId" TEXT,
    "costCenterId" TEXT,
    "raw" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetKksNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceFrequency" (
    "id" TEXT NOT NULL,
    "code" "FrequencyCode" NOT NULL,
    "label" TEXT NOT NULL,
    "monthsInterval" INTEGER,

    CONSTRAINT "MaintenanceFrequency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTemplate" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "assetNodeId" TEXT,
    "frequencyId" TEXT NOT NULL,
    "requiredSpecialtyId" TEXT,
    "sourcePosition" TEXT,
    "planName" TEXT NOT NULL,
    "routeSheet" TEXT,
    "activityName" TEXT NOT NULL,
    "wbsElement" TEXT,
    "startMonth" INTEGER,
    "requiresEvidence" BOOLEAN NOT NULL DEFAULT true,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceOccurrence" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "assetNodeId" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "OccurrenceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sourceMonthKey" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "assetNodeId" TEXT,
    "occurrenceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "criticality" "IssueSeverity" NOT NULL DEFAULT 'INFO',
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "plannedHours" DOUBLE PRECISION,
    "importedProgress" DOUBLE PRECISION,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "assignedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderMilestone" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "configId" TEXT,
    "label" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneConfig" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "requiredEvidence" BOOLEAN NOT NULL DEFAULT false,
    "requiredSpecialtyId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MilestoneConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderStatusHistory" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "fromStatus" "WorkOrderStatus",
    "toStatus" "WorkOrderStatus" NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderComment" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "personnelId" TEXT,
    "userId" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HhEntry" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "userId" TEXT,
    "hours" DOUBLE PRECISION NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HhEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceFile" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignedReport" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT,
    "signedById" TEXT,
    "reportNumber" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientApproval" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "respondedById" TEXT,
    "approved" BOOLEAN,
    "comments" TEXT,

    CONSTRAINT "ClientApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantRecertification" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "isIrregular" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,

    CONSTRAINT "PlantRecertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecertificationCycle" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecertificationCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecertificationDocument" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecertificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "fileType" "ImportFileType" NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedById" TEXT,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT,
    "dryRun" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "sheetName" TEXT,
    "fileName" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rowHash" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "createdEntity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportIssue" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "resolution" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportMapping" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "targetPlantId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "previousHash" TEXT,
    "eventHash" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiDailySummary" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "day" TIMESTAMP(3) NOT NULL,
    "overdueWorkOrders" INTEGER NOT NULL DEFAULT 0,
    "upcomingOccurrences30d" INTEGER NOT NULL DEFAULT 0,
    "plannedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "healthScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiDailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_daily_measures" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "day" TIMESTAMP(3) NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "dimensions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_daily_measures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "outputKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "severity" "NotificationSeverity" NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minimumSeverity" "NotificationSeverity" NOT NULL DEFAULT 'WARNING',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refreshHash_key" ON "user_sessions"("refreshHash");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_organizationId_idx" ON "Client"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Plant_code_key" ON "Plant"("code");

-- CreateIndex
CREATE INDEX "Plant_clientId_idx" ON "Plant"("clientId");

-- CreateIndex
CREATE INDEX "Plant_status_healthScore_idx" ON "Plant"("status", "healthScore");

-- CreateIndex
CREATE INDEX "PlantAlias_plantId_idx" ON "PlantAlias"("plantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlantAlias_aliasCode_source_key" ON "PlantAlias"("aliasCode", "source");

-- CreateIndex
CREATE INDEX "UserPlantScope_plantId_idx" ON "UserPlantScope"("plantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPlantScope_userId_plantId_key" ON "UserPlantScope"("userId", "plantId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_code_key" ON "WorkCenter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_code_key" ON "Specialty"("code");

-- CreateIndex
CREATE INDEX "Personnel_primarySpecialtyId_idx" ON "Personnel"("primarySpecialtyId");

-- CreateIndex
CREATE INDEX "Personnel_workCenterId_idx" ON "Personnel"("workCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetKksNode_technicalObject_key" ON "AssetKksNode"("technicalObject");

-- CreateIndex
CREATE INDEX "AssetKksNode_plantId_nodeType_idx" ON "AssetKksNode"("plantId", "nodeType");

-- CreateIndex
CREATE INDEX "AssetKksNode_parentId_idx" ON "AssetKksNode"("parentId");

-- CreateIndex
CREATE INDEX "AssetKksNode_kks_idx" ON "AssetKksNode"("kks");

-- CreateIndex
CREATE INDEX "AssetKksNode_equipmentCode_idx" ON "AssetKksNode"("equipmentCode");

-- CreateIndex
CREATE INDEX "AssetKksNode_center_idx" ON "AssetKksNode"("center");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceFrequency_code_key" ON "MaintenanceFrequency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceTemplate_sourceHash_key" ON "MaintenanceTemplate"("sourceHash");

-- CreateIndex
CREATE INDEX "MaintenanceTemplate_plantId_idx" ON "MaintenanceTemplate"("plantId");

-- CreateIndex
CREATE INDEX "MaintenanceTemplate_assetNodeId_idx" ON "MaintenanceTemplate"("assetNodeId");

-- CreateIndex
CREATE INDEX "MaintenanceTemplate_frequencyId_idx" ON "MaintenanceTemplate"("frequencyId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceOccurrence_sourceHash_key" ON "MaintenanceOccurrence"("sourceHash");

-- CreateIndex
CREATE INDEX "MaintenanceOccurrence_plantId_scheduledFor_idx" ON "MaintenanceOccurrence"("plantId", "scheduledFor");

-- CreateIndex
CREATE INDEX "MaintenanceOccurrence_status_scheduledFor_idx" ON "MaintenanceOccurrence"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "MaintenanceOccurrence_assetNodeId_idx" ON "MaintenanceOccurrence"("assetNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_code_key" ON "WorkOrder"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_occurrenceId_key" ON "WorkOrder"("occurrenceId");

-- CreateIndex
CREATE INDEX "WorkOrder_plantId_status_idx" ON "WorkOrder"("plantId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_status_plannedStart_idx" ON "WorkOrder"("status", "plannedStart");

-- CreateIndex
CREATE INDEX "WorkOrder_assetNodeId_idx" ON "WorkOrder"("assetNodeId");

-- CreateIndex
CREATE INDEX "WorkOrder_assignedUserId_idx" ON "WorkOrder"("assignedUserId");

-- CreateIndex
CREATE INDEX "WorkOrderMilestone_workOrderId_status_idx" ON "WorkOrderMilestone"("workOrderId", "status");

-- CreateIndex
CREATE INDEX "WorkOrderMilestone_configId_idx" ON "WorkOrderMilestone"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneConfig_code_key" ON "MilestoneConfig"("code");

-- CreateIndex
CREATE INDEX "MilestoneConfig_active_order_idx" ON "MilestoneConfig"("active", "order");

-- CreateIndex
CREATE INDEX "MilestoneConfig_requiredSpecialtyId_idx" ON "MilestoneConfig"("requiredSpecialtyId");

-- CreateIndex
CREATE INDEX "WorkOrderStatusHistory_workOrderId_createdAt_idx" ON "WorkOrderStatusHistory"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrderStatusHistory_changedById_createdAt_idx" ON "WorkOrderStatusHistory"("changedById", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrderStatusHistory_toStatus_createdAt_idx" ON "WorkOrderStatusHistory"("toStatus", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrderComment_workOrderId_createdAt_idx" ON "WorkOrderComment"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkOrderComment_authorUserId_createdAt_idx" ON "WorkOrderComment"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Assignment_workOrderId_idx" ON "Assignment"("workOrderId");

-- CreateIndex
CREATE INDEX "Assignment_personnelId_startsAt_idx" ON "Assignment"("personnelId", "startsAt");

-- CreateIndex
CREATE INDEX "Assignment_userId_idx" ON "Assignment"("userId");

-- CreateIndex
CREATE INDEX "HhEntry_workOrderId_entryDate_idx" ON "HhEntry"("workOrderId", "entryDate");

-- CreateIndex
CREATE INDEX "HhEntry_userId_entryDate_idx" ON "HhEntry"("userId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceFile_storageKey_key" ON "EvidenceFile"("storageKey");

-- CreateIndex
CREATE INDEX "EvidenceFile_workOrderId_idx" ON "EvidenceFile"("workOrderId");

-- CreateIndex
CREATE INDEX "EvidenceFile_uploadedById_idx" ON "EvidenceFile"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "SignedReport_reportNumber_key" ON "SignedReport"("reportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SignedReport_storageKey_key" ON "SignedReport"("storageKey");

-- CreateIndex
CREATE INDEX "SignedReport_workOrderId_idx" ON "SignedReport"("workOrderId");

-- CreateIndex
CREATE INDEX "SignedReport_signedById_signedAt_idx" ON "SignedReport"("signedById", "signedAt");

-- CreateIndex
CREATE INDEX "ClientApproval_workOrderId_respondedAt_idx" ON "ClientApproval"("workOrderId", "respondedAt");

-- CreateIndex
CREATE INDEX "PlantRecertification_plantId_dueDate_idx" ON "PlantRecertification"("plantId", "dueDate");

-- CreateIndex
CREATE INDEX "RecertificationCycle_plantId_dueAt_idx" ON "RecertificationCycle"("plantId", "dueAt");

-- CreateIndex
CREATE INDEX "RecertificationCycle_status_dueAt_idx" ON "RecertificationCycle"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecertificationCycle_plantId_code_key" ON "RecertificationCycle"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RecertificationDocument_storageKey_key" ON "RecertificationDocument"("storageKey");

-- CreateIndex
CREATE INDEX "RecertificationDocument_cycleId_idx" ON "RecertificationDocument"("cycleId");

-- CreateIndex
CREATE INDEX "RecertificationDocument_uploadedById_createdAt_idx" ON "RecertificationDocument"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_fileType_status_idx" ON "ImportJob"("fileType", "status");

-- CreateIndex
CREATE INDEX "ImportFile_importJobId_idx" ON "ImportFile"("importJobId");

-- CreateIndex
CREATE INDEX "ImportRow_rowHash_idx" ON "ImportRow"("rowHash");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_importJobId_sheetName_rowNumber_key" ON "ImportRow"("importJobId", "sheetName", "rowNumber");

-- CreateIndex
CREATE INDEX "ImportIssue_importJobId_severity_idx" ON "ImportIssue"("importJobId", "severity");

-- CreateIndex
CREATE INDEX "ImportMapping_targetPlantId_idx" ON "ImportMapping"("targetPlantId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportMapping_sourceType_sourceValue_key" ON "ImportMapping"("sourceType", "sourceValue");

-- CreateIndex
CREATE INDEX "audit_events_resource_resourceId_idx" ON "audit_events"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_events_actorUserId_createdAt_idx" ON "audit_events"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_eventHash_idx" ON "audit_events"("eventHash");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "KpiDailySummary_day_idx" ON "KpiDailySummary"("day");

-- CreateIndex
CREATE UNIQUE INDEX "KpiDailySummary_plantId_day_key" ON "KpiDailySummary"("plantId", "day");

-- CreateIndex
CREATE INDEX "kpi_daily_measures_day_metric_idx" ON "kpi_daily_measures"("day", "metric");

-- CreateIndex
CREATE INDEX "kpi_daily_measures_plantId_day_idx" ON "kpi_daily_measures"("plantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_daily_measures_plantId_day_metric_key" ON "kpi_daily_measures"("plantId", "day", "metric");

-- CreateIndex
CREATE INDEX "NotificationEvent_plantId_severity_idx" ON "NotificationEvent"("plantId", "severity");

-- CreateIndex
CREATE INDEX "NotificationEvent_dispatchedAt_idx" ON "NotificationEvent"("dispatchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_revokedAt_idx" ON "PushSubscription"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plant" ADD CONSTRAINT "Plant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantAlias" ADD CONSTRAINT "PlantAlias_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlantScope" ADD CONSTRAINT "UserPlantScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPlantScope" ADD CONSTRAINT "UserPlantScope_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_primarySpecialtyId_fkey" FOREIGN KEY ("primarySpecialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetKksNode" ADD CONSTRAINT "AssetKksNode_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetKksNode" ADD CONSTRAINT "AssetKksNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AssetKksNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetKksNode" ADD CONSTRAINT "AssetKksNode_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetKksNode" ADD CONSTRAINT "AssetKksNode_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTemplate" ADD CONSTRAINT "MaintenanceTemplate_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTemplate" ADD CONSTRAINT "MaintenanceTemplate_assetNodeId_fkey" FOREIGN KEY ("assetNodeId") REFERENCES "AssetKksNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTemplate" ADD CONSTRAINT "MaintenanceTemplate_frequencyId_fkey" FOREIGN KEY ("frequencyId") REFERENCES "MaintenanceFrequency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceTemplate" ADD CONSTRAINT "MaintenanceTemplate_requiredSpecialtyId_fkey" FOREIGN KEY ("requiredSpecialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceOccurrence" ADD CONSTRAINT "MaintenanceOccurrence_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MaintenanceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceOccurrence" ADD CONSTRAINT "MaintenanceOccurrence_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceOccurrence" ADD CONSTRAINT "MaintenanceOccurrence_assetNodeId_fkey" FOREIGN KEY ("assetNodeId") REFERENCES "AssetKksNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assetNodeId_fkey" FOREIGN KEY ("assetNodeId") REFERENCES "AssetKksNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "MaintenanceOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderMilestone" ADD CONSTRAINT "WorkOrderMilestone_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderMilestone" ADD CONSTRAINT "WorkOrderMilestone_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MilestoneConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MilestoneConfig" ADD CONSTRAINT "MilestoneConfig_requiredSpecialtyId_fkey" FOREIGN KEY ("requiredSpecialtyId") REFERENCES "Specialty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStatusHistory" ADD CONSTRAINT "WorkOrderStatusHistory_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStatusHistory" ADD CONSTRAINT "WorkOrderStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderComment" ADD CONSTRAINT "WorkOrderComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HhEntry" ADD CONSTRAINT "HhEntry_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HhEntry" ADD CONSTRAINT "HhEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedReport" ADD CONSTRAINT "SignedReport_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedReport" ADD CONSTRAINT "SignedReport_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientApproval" ADD CONSTRAINT "ClientApproval_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientApproval" ADD CONSTRAINT "ClientApproval_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantRecertification" ADD CONSTRAINT "PlantRecertification_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecertificationCycle" ADD CONSTRAINT "RecertificationCycle_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecertificationDocument" ADD CONSTRAINT "RecertificationDocument_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "RecertificationCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecertificationDocument" ADD CONSTRAINT "RecertificationDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportIssue" ADD CONSTRAINT "ImportIssue_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMapping" ADD CONSTRAINT "ImportMapping_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportMapping" ADD CONSTRAINT "ImportMapping_targetPlantId_fkey" FOREIGN KEY ("targetPlantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiDailySummary" ADD CONSTRAINT "KpiDailySummary_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_daily_measures" ADD CONSTRAINT "kpi_daily_measures_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Append-only audit log guard
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_mutation();

DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events;
CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_mutation();
