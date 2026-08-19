-- doubao-embedding-vision 实际输出 2048 维向量，原 vector(1536) 列无法存储。
-- 旧值是解析 bug 期间写入的 1536 维 keywordVector 兜底向量（无语义价值），
-- 先清空再改列类型，随后由 scripts/backfill-embedding.ts --force 回填真向量。
UPDATE "KnowledgeNode" SET embedding = NULL;
ALTER TABLE "KnowledgeNode" ALTER COLUMN embedding TYPE vector(2048);
