-- 前端运行时错误上报表（2026-08 "CSS 未加载"白屏靠用户报告才发现的教训）
CREATE TABLE IF NOT EXISTS "ClientErrorLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "message" TEXT NOT NULL,
  "stack" TEXT,
  "url" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientErrorLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClientErrorLog_createdAt_idx" ON "ClientErrorLog"("createdAt");
CREATE INDEX IF NOT EXISTS "ClientErrorLog_userId_idx" ON "ClientErrorLog"("userId");
