-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to KnowledgeNode for vector similarity search
ALTER TABLE "KnowledgeNode" ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create an index for approximate nearest neighbor search
-- (index is advisory; remove this comment line if the table is large before creating)
-- CREATE INDEX IF NOT EXISTS idx_knowledge_node_embedding ON "KnowledgeNode" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
