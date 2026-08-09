-- 高频外键过滤列补索引（Prisma 不会自动为外键建索引）。
-- 覆盖：学科页/导图过滤（KnowledgeNode.subjectId/chapterId、KnowledgeEdge.fromId/toId）、
-- 复习页到期任务（ReviewTask.userId+dueDate）、错题本（Mistake.userId+nextReviewAt）、
-- 看板/学习者模型统计（ReviewLog/MistakeLog/RefreshToken.userId）等。
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "Chapter_subjectId_idx" ON "Chapter"("subjectId");
CREATE INDEX "KnowledgeNode_subjectId_idx" ON "KnowledgeNode"("subjectId");
CREATE INDEX "KnowledgeNode_chapterId_idx" ON "KnowledgeNode"("chapterId");
CREATE INDEX "KnowledgeEdge_fromId_idx" ON "KnowledgeEdge"("fromId");
CREATE INDEX "KnowledgeEdge_toId_idx" ON "KnowledgeEdge"("toId");
CREATE INDEX "KnowledgeCard_knowledgeNodeId_idx" ON "KnowledgeCard"("knowledgeNodeId");
CREATE INDEX "Question_knowledgeNodeId_idx" ON "Question"("knowledgeNodeId");
CREATE INDEX "Mistake_userId_nextReviewAt_idx" ON "Mistake"("userId", "nextReviewAt");
CREATE INDEX "MistakeLog_userId_idx" ON "MistakeLog"("userId");
CREATE INDEX "ReviewTask_userId_dueDate_idx" ON "ReviewTask"("userId", "dueDate");
CREATE INDEX "ReviewTask_userId_knowledgeNodeId_idx" ON "ReviewTask"("userId", "knowledgeNodeId");
CREATE INDEX "ReviewLog_userId_createdAt_idx" ON "ReviewLog"("userId", "createdAt");
