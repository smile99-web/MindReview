-- 错题查重：record-mistakes / mistakes POST 每次写入前都按 (userId, questionText)
-- findFirst/findMany 查重，此前无索引全表扫。
CREATE INDEX IF NOT EXISTS "Mistake_userId_questionText_idx" ON "Mistake"("userId", "questionText");

-- 建边查重：mindmap POST 手工边与 generate-relations 批量边都按
-- (fromId, toId, relationType) 三元组查重，此前只有 fromId / toId 单列索引。
CREATE INDEX IF NOT EXISTS "KnowledgeEdge_fromId_toId_relationType_idx" ON "KnowledgeEdge"("fromId", "toId", "relationType");
