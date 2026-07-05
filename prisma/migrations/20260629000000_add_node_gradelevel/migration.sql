-- AlterTable
ALTER TABLE "KnowledgeNode" ADD COLUMN "gradeLevel" TEXT;

-- CreateIndex
CREATE INDEX "KnowledgeNode_subjectId_gradeLevel_idx" ON "KnowledgeNode"("subjectId", "gradeLevel");
