/**
 * Embedding generation and vector search utilities.
 * Uses DeepSeek-compatible embeddings API with a keyword-based fallback
 * for when the embeddings endpoint is unavailable.
 */

import { prisma } from '@/lib/prisma';

const EMBEDDING_DIM = 1536;

interface SearchableNode {
  id: string;
  title: string;
  summary: string | null;
  subject: { name: string } | null;
}

function hashWord(word: string): number {
  let h = 0;
  for (let i = 0; i < word.length; i++) {
    h = ((h << 5) - h + word.charCodeAt(i)) | 0;
  }
  return h;
}

/** Simple TF-IDF-like keyword vector as fallback when embeddings API is not available */
function keywordVector(text: string, dim: number = EMBEDDING_DIM): number[] {
  const vector = new Array(dim).fill(0);
  const words = text
    .replace(/[^一-鿿\w]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);

  if (words.length === 0) return vector;

  const tf: Record<string, number> = {};
  for (const w of words) {
    tf[w] = (tf[w] || 0) + 1;
  }

  for (const [word, freq] of Object.entries(tf)) {
    const idx = Math.abs(hashWord(word)) % dim;
    vector[idx] += freq / words.length;
  }

  // L2 normalize
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vector[i] /= norm;
  }

  return vector;
}

async function fetchEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

  if (!apiKey || apiKey === 'sk-placeholder') {
    return keywordVector(text);
  }

  try {
    const res = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        input: text,
      }),
    });

    if (!res.ok) {
      throw new Error(`Embedding API returned ${res.status}`);
    }

    const data = await res.json();
    return data.data?.[0]?.embedding || keywordVector(text);
  } catch {
    return keywordVector(text);
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return fetchEmbedding(text);
}

export async function generateAndSaveEmbedding(nodeId: string): Promise<void> {
  const node = await prisma.knowledgeNode.findUnique({
    where: { id: nodeId },
    select: { id: true, title: true, summary: true },
  });

  if (!node) return;

  const text = `${node.title} ${node.summary || ''}`.trim();
  if (!text) return;

  const embedding = await fetchEmbedding(text);
  const embeddingStr = `[${embedding.join(',')}]`;

  await prisma.$executeRawUnsafe(
    `UPDATE "KnowledgeNode" SET embedding = $1::vector WHERE id = $2`,
    embeddingStr,
    nodeId,
  );
}

export async function searchSimilarNodes(
  query: string,
  limit: number = 10,
  subjectId?: string,
): Promise<Array<{ id: string; title: string; summary: string; subjectName: string; score: number }>> {
  const where: Record<string, unknown> = {};
  if (subjectId) where.subjectId = subjectId;

  // Fetch nodes without embedding (unsupported type) and use text-based scoring
  const nodes = await prisma.knowledgeNode.findMany({
    where,
    select: {
      id: true,
      title: true,
      summary: true,
      subject: { select: { name: true } },
    },
    take: 100,
  });

  const scored = nodes
    .map((node: SearchableNode) => {
      let score = 0;
      // Boost text matches
      const lowerQuery = query.toLowerCase();
      if (node.title.toLowerCase().includes(lowerQuery)) score = Math.max(score, 0.5);
      if (node.summary?.toLowerCase().includes(lowerQuery)) score = Math.max(score, 0.3);
      if (node.title.toLowerCase() === lowerQuery) score = 0.9;

      return {
        id: node.id,
        title: node.title,
        summary: node.summary || '',
        subjectName: node.subject?.name || '',
        score,
      };
    })
    .filter((n: { score: number }) => n.score > 0)
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
