-- CreateEnum
CREATE TYPE "VisitPlanStatus" AS ENUM ('SCHEDULED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitAccessStatus" AS ENUM ('PENDING', 'REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClientApprovalType" AS ENUM ('NOTIFICATION_ONLY', 'ACCESS_REQUIRED', 'EXECUTION_APPROVAL', 'CONFORMITY_REQUIRED');

-- AlterEnum
ALTER TYPE "WorkOrderStatus" ADD VALUE 'CLIENT_NOTIFIED';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'PENDING_ACCESS';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'PENDING_EXECUTION_APPROVAL';
ALTER TYPE "WorkOrderStatus" ADD VALUE 'PENDING_CONFORMITY';

-- AlterTable
ALTER TABLE "MaintenanceTemplate" ADD COLUMN "clientApprovalType" "ClientApprovalType" NOT NULL DEFAULT 'NOTIFICATION_ONLY';

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN "visitPlanId" TEXT;

-- CreateTable
CREATE TABLE "VisitPlan" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "scheduledFor" DATE NOT NULL,
    "responsiblePersonnelId" TEXT,
    "crewMemberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "equipmentItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredPermits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clientContact" TEXT,
    "accessStatus" "VisitAccessStatus" NOT NULL DEFAULT 'PENDING',
    "status" "VisitPlanStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "generalEvidenceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitPlan_plantId_scheduledFor_idx" ON "VisitPlan"("plantId", "scheduledFor");

-- CreateIndex
CREATE INDEX "VisitPlan_responsiblePersonnelId_scheduledFor_idx" ON "VisitPlan"("responsiblePersonnelId", "scheduledFor");

-- CreateIndex
CREATE INDEX "VisitPlan_status_scheduledFor_idx" ON "VisitPlan"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "VisitPlan_accessStatus_scheduledFor_idx" ON "VisitPlan"("accessStatus", "scheduledFor");

-- CreateIndex
CREATE INDEX "WorkOrder_visitPlanId_idx" ON "WorkOrder"("visitPlanId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_visitPlanId_fkey" FOREIGN KEY ("visitPlanId") REFERENCES "VisitPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitPlan" ADD CONSTRAINT "VisitPlan_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitPlan" ADD CONSTRAINT "VisitPlan_responsiblePersonnelId_fkey" FOREIGN KEY ("responsiblePersonnelId") REFERENCES "Personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
