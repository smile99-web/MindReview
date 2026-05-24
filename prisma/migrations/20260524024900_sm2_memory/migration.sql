-- AlterTable
ALTER TABLE "KnowledgeNode" ADD COLUMN     "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
ADD COLUMN     "forgetRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "intervalDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastReviewAt" TIMESTAMP(3),
ADD COLUMN     "nextReviewAt" TIMESTAMP(3),
ADD COLUMN     "repetitions" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ReviewLog" ADD COLUMN     "easeFactorAfter" DOUBLE PRECISION,
ADD COLUMN     "easeFactorBefore" DOUBLE PRECISION,
ADD COLUMN     "forgetRisk" DOUBLE PRECISION,
ADD COLUMN     "intervalAfter" INTEGER,
ADD COLUMN     "intervalBefore" INTEGER,
ADD COLUMN     "quality" INTEGER,
ADD COLUMN     "repetitions" INTEGER;

-- CreateTable
CREATE TABLE "MistakeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "knowledgeNodeId" TEXT,
    "reviewLogId" TEXT,
    "mistakeType" TEXT NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "triggerCount" INTEGER NOT NULL DEFAULT 1,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MistakeLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MistakeLog" ADD CONSTRAINT "MistakeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MistakeLog" ADD CONSTRAINT "MistakeLog_knowledgeNodeId_fkey" FOREIGN KEY ("knowledgeNodeId") REFERENCES "KnowledgeNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MistakeLog" ADD CONSTRAINT "MistakeLog_reviewLogId_fkey" FOREIGN KEY ("reviewLogId") REFERENCES "ReviewLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
