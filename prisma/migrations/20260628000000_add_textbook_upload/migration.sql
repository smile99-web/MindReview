-- CreateTable
CREATE TABLE "TextbookUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "decomposedChapters" JSONB NOT NULL DEFAULT '[]',
    "chapterImports" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TextbookUpload_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TextbookUpload_userId_createdAt_idx" ON "TextbookUpload"("userId", "createdAt");
ALTER TABLE "TextbookUpload" ADD CONSTRAINT "TextbookUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TextbookUpload" ADD CONSTRAINT "TextbookUpload_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
