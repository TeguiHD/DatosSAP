/*
  Warnings:

  - Added the required column `cycleYears` to the `RecertificationCycle` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Plant" ADD COLUMN     "centerCode" VARCHAR(10),
ADD COLUMN     "commissionedAt" DATE;

-- AlterTable
ALTER TABLE "RecertificationCycle" ADD COLUMN     "cycleYears" INTEGER NOT NULL,
ADD COLUMN     "isIrregular" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "dueAt" SET DATA TYPE DATE;
