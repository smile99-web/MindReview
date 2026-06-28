-- CreateTable
CREATE TABLE "DocUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "subjectName" TEXT,
    "content" TEXT NOT NULL,
    "knowledgePoints" JSONB NOT NULL DEFAULT '[]',
    "practiceQuestions" JSONB NOT NULL DEFAULT '[]',
    "userNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocUpload_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocUpload_userId_createdAt_idx" ON "DocUpload"("userId", "createdAt");
ALTER TABLE "DocUpload" ADD CONSTRAINT "DocUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
