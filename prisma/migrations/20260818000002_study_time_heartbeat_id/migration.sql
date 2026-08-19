-- 心跳幂等键：客户端每次心跳生成 heartbeatId，弱网重试/响应丢失时
-- 服务端按 (userId, heartbeatId) 去重，不重复累计学习时长。
-- NULL 不参与唯一约束（存量行无键）。
ALTER TABLE "StudyTimeLog" ADD COLUMN "heartbeatId" TEXT;
CREATE UNIQUE INDEX "StudyTimeLog_userId_heartbeatId_key" ON "StudyTimeLog"("userId", "heartbeatId");
