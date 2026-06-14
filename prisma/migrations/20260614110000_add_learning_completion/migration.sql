-- AlterTable
ALTER TABLE "UserKnowledgeProgress"
  ADD COLUMN "readCompletedAt" TIMESTAMP(3),
  ADD COLUMN "practicedCompletedAt" TIMESTAMP(3);
