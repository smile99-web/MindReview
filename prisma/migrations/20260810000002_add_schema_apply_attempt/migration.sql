-- 图式迁移应用练习成绩（/schemas/[id]/apply 的 onComplete 落库）
CREATE TABLE "SchemaApplyAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schemaId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchemaApplyAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchemaApplyAttempt_userId_schemaId_idx" ON "SchemaApplyAttempt"("userId", "schemaId");

ALTER TABLE "SchemaApplyAttempt" ADD CONSTRAINT "SchemaApplyAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
