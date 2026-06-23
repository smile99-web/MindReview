-- CreateTable
CREATE TABLE "ExamUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageData" BYTEA,
    "subjectName" TEXT,
    "ocrText" TEXT NOT NULL,
    "knowledgePoints" JSONB NOT NULL DEFAULT '[]',
    "practiceQuestions" JSONB NOT NULL DEFAULT '[]',
    "userNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamUpload_userId_createdAt_idx" ON "ExamUpload"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExamUpload" ADD CONSTRAINT "ExamUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
