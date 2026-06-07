-- CreateTable
CREATE TABLE "UserKnowledgeProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "knowledgeNodeId" TEXT NOT NULL,
    "masteryLevel" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" TIMESTAMP(3),
    "lastReviewAt" TIMESTAMP(3),
    "forgetRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserKnowledgeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserKnowledgeProgress_userId_knowledgeNodeId_key" ON "UserKnowledgeProgress"("userId", "knowledgeNodeId");

-- CreateIndex
CREATE INDEX "UserKnowledgeProgress_userId_nextReviewAt_idx" ON "UserKnowledgeProgress"("userId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "UserKnowledgeProgress_knowledgeNodeId_idx" ON "UserKnowledgeProgress"("knowledgeNodeId");

-- AddForeignKey
ALTER TABLE "UserKnowledgeProgress" ADD CONSTRAINT "UserKnowledgeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserKnowledgeProgress" ADD CONSTRAINT "UserKnowledgeProgress_knowledgeNodeId_fkey" FOREIGN KEY ("knowledgeNodeId") REFERENCES "KnowledgeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
