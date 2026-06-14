-- AlterTable
ALTER TABLE "UserKnowledgeProgress"
  ADD COLUMN     "constructiveCompletedAt" TIMESTAMP(3),
  ADD COLUMN     "interactiveCompletedAt" TIMESTAMP(3);
