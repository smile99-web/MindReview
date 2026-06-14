-- CreateTable
CREATE TABLE "StudyTimeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'activity-tracker',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyTimeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyTimeLog_userId_startedAt_idx" ON "StudyTimeLog"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "StudyTimeLog_userId_createdAt_idx" ON "StudyTimeLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudyTimeLog" ADD CONSTRAINT "StudyTimeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;