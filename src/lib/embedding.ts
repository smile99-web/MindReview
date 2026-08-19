/**
 * Embedding generation and vector search utilities.
 * Uses Doubao Embedding Vision API (via Ark/Volcengine) with DB-stored API key,
 * falling back to a keyword-based TF-IDF vector when the API is unavailable.
 *
 * API reference: POST /api/v3/embeddings/multimodal
 * Model: doubao-embedding-vision-250615
 * Input: [{type: "text", text: "..."}]
 */

import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/secrets';
import { getArkConfig } from '@/lib/ark';
import { assertSafeExternalBaseUrl } from '@/lib/url-security';

// doubao-embedding-vision 实际输出 2048 维（旧注释里的 1536 是错的——
// 向量列也因此从 vector(1536) 迁移为 vector(2048)）。
// keywordVector 兜底向量的维度必须与列一致，否则写库失败。
const EMBEDDING_DIM = 2048;

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

async function getEmbeddingCredentials(): Promise<{ apiKey: string; baseUrl: string; model: string } | null> {
  // 方舟统一调用优先；未启用时回退到 Embedding 独立配置 / 环境变量
  const ark = await getArkConfig();
  if (ark) {
    return { apiKey: ark.apiKey, baseUrl: ark.baseUrl, model: ark.models.embedding };
  }
  // Try DB-stored key first (Settings page), then env var
  try {
    const stored = await prisma.apiKey.findUnique({ where: { service: 'embedding' } });
    // 与 llm/image 客户端一致：设置页禁用（isActive=false）后不得再发请求计费
    if (stored?.isActive && stored.key) {
      // 读取侧复核 baseUrl（同 ark.ts 注释）：embedding 请求带 Bearer key，
      // baseUrl 被篡改即明文 key 外泄。此前是全项目唯一不校验的客户端。
      const baseUrl = assertSafeExternalBaseUrl(
        stored.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3',
      );
      return {
        apiKey: decryptSecret(stored.key),
        baseUrl,
        model: stored.model || 'doubao-embedding-vision-250615',
      };
    }
  } catch { /* DB may not be available */ }

  // Fallback to env vars。注意：只配 DEEPSEEK_API_KEY 时这是必失败的死配置
  // ——DeepSeek 端点没有 doubao-embedding 模型，每次都会静默落 keywordVector
  // 并掩盖配置错误。保留仅为兼容"DeepSeek 兼容网关托管了该模型"的部署，
  // 命中时打一次 warn 提醒。
  const apiKey = process.env.DOUBAO_EMBEDDING_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (apiKey && apiKey !== 'sk-placeholder') {
    if (!process.env.DOUBAO_EMBEDDING_API_KEY) {
      console.warn(
        '[embedding] 未配置 DOUBAO_EMBEDDING_API_KEY，正在用 DEEPSEEK_API_KEY 调 embedding——' +
        'DeepSeek 官方端点没有 doubao-embedding 模型，若持续失败请在设置页配置独立的 Embedding Key',
      );
    }
    // 校验失败（如内网/http 网关地址被安全策略拦截）必须降级而非把异常
    // 抛给调用方（否则 /api/search 直接 500）
    let envBaseUrl: string;
    try {
      envBaseUrl = assertSafeExternalBaseUrl(
        process.env.DOUBAO_EMBEDDING_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      );
    } catch {
      console.warn('[embedding] env baseUrl 未通过安全校验，回退关键词检索');
      return null;
    }
    return {
      apiKey,
      baseUrl: envBaseUrl,
      model: process.env.DOUBAO_EMBEDDING_MODEL || 'doubao-embedding-vision-250615',
    };
  }

  return null;
}

async function fetchEmbedding(text: string): Promise<number[]> {
  return (await fetchEmbeddingDetailed(text)).vector;
}

/**
 * 带出处标记的向量获取：向量检索必须知道向量来自真实 API 还是
 * keywordVector 兜底——兜底向量是 TF-IDF 哈希向量，与 API 模型生成的
 * 节点向量不在同一空间，混用会得到垃圾排序（此时必须走关键词检索）。
 */
async function fetchEmbeddingDetailed(text: string): Promise<{ vector: number[]; fromApi: boolean }> {
  const creds = await getEmbeddingCredentials();
  if (!creds) return { vector: keywordVector(text), fromApi: false };

  try {
    // 多模态向量模型走专用路径 /embeddings/multimodal（input 为对象数组）；
    // Agent Plan 的 /plan/v3 下该路径未在文档中明示，404 时回退到 OpenAI 兼容
    // 的 /embeddings（input 为字符串数组），由服务端按模型路由
    let res = await fetch(`${creds.baseUrl}/embeddings/multimodal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.apiKey}`,
      },
      body: JSON.stringify({
        model: creds.model,
        input: [{ type: 'text', text }],
      }),
    });

    if (res.status === 404) {
      res = await fetch(`${creds.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${creds.apiKey}`,
        },
        body: JSON.stringify({
          model: creds.model,
          input: [text],
        }),
      });
    }

    if (!res.ok) {
      throw new Error(`Embedding API returned ${res.status}`);
    }

    const data = await res.json();
    // 两种端点响应形状不同：OpenAI 兼容 /embeddings 返回
    // data: [{embedding: [...]}]；火山 multimodal 端点返回
    // data: {embedding: [...]}（单个对象）。此前只读 [0]，multimodal
    // 的响应被静默丢弃 → 全部节点落的是 keywordVector 兜底向量
    // （926 个节点的"embedding 回填"实际上一个真向量都没写入）。
    const vec = data.data?.[0]?.embedding ?? data.data?.embedding;
    if (Array.isArray(vec) && vec.length > 0) {
      return { vector: vec as number[], fromApi: true };
    }
    return { vector: keywordVector(text), fromApi: false };
  } catch {
    return { vector: keywordVector(text), fromApi: false };
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return fetchEmbedding(text);
}

export async function generateAndSaveEmbedding(nodeId: string): Promise<boolean> {
  const node = await prisma.knowledgeNode.findUnique({
    where: { id: nodeId },
    select: { id: true, title: true, summary: true },
  });

  if (!node) return false;

  const text = `${node.title} ${node.summary || ''}`.trim();
  if (!text) return false;

  const { vector, fromApi } = await fetchEmbeddingDetailed(text);
  // 只写真向量：API 失败（429/超时/配置缺失）时 fetchEmbeddingDetailed 回退到
  // keywordVector（TF-IDF 哈希），与模型向量不在同一空间——写入会污染整个
  // 向量库使排序变垃圾（2026-08 配额耗尽时 926 个节点被写入兜底向量的教训）。
  // 不写时该节点由搜索的关键词兜底覆盖，下次回填再补。
  if (!fromApi) {
    console.warn(`[generateAndSaveEmbedding] skip ${nodeId}: embedding API unavailable, not saving fallback vector`);
    return false;
  }

  const embeddingStr = `[${vector.join(',')}]`;

  await prisma.$executeRawUnsafe(
    `UPDATE "KnowledgeNode" SET embedding = $1::vector WHERE id = $2`,
    embeddingStr,
    nodeId,
  );
  return true;
}

interface SimilarNodeResult {
  id: string;
  title: string;
  summary: string;
  subjectName: string;
  score: number;
}

/** 关键词检索（原实现）：ILIKE 预过滤 + 内存打分 */
async function keywordSearchNodes(
  query: string,
  limit: number,
  subjectId?: string,
  excludeIds?: Set<string>,
): Promise<SimilarNodeResult[]> {
  // 两阶段：先 ILIKE 预过滤候选（与下方打分子串逻辑同口径），再内存打分。
  // take:500 只是兜底安全上限，正常匹配集远小于它。
  const nodes = await prisma.knowledgeNode.findMany({
    where: {
      ...(subjectId ? { subjectId } : {}),
      ...(excludeIds && excludeIds.size > 0 ? { id: { notIn: [...excludeIds] } } : {}),
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { summary: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      title: true,
      summary: true,
      subject: { select: { name: true } },
    },
    take: 500,
  });

  return nodes
    .map((node: SearchableNode) => {
      let score = 0;
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
}

export async function searchSimilarNodes(
  query: string,
  limit: number = 10,
  subjectId?: string,
): Promise<SimilarNodeResult[]> {
  // 语义检索：查询向量来自真实 Embedding API 时，用 pgvector 余弦距离排序。
  // 此前 embedding 列只写不读——每个节点都花了 API 费用生成向量，搜索却
  // 一直走关键词兜底。API 不可用 / 查询向量是 keywordVector 兜底时，
  // 向量空间不一致，必须回退关键词检索。
  const { vector, fromApi } = await fetchEmbeddingDetailed(query);

  if (fromApi) {
    try {
      const vectorStr = `[${vector.join(',')}]`;
      const params: unknown[] = [vectorStr];
      let sql = `
        SELECT n.id, n.title, n.summary, s.name AS "subjectName",
               (n.embedding <=> $1::vector) AS distance
        FROM "KnowledgeNode" n
        LEFT JOIN "Subject" s ON s.id = n."subjectId"
        WHERE n.embedding IS NOT NULL`;
      if (subjectId) {
        params.push(subjectId);
        sql += ` AND n."subjectId" = $${params.length}`;
      }
      params.push(limit);
      sql += ` ORDER BY n.embedding <=> $1::vector LIMIT $${params.length}`;

      const rows = await prisma.$queryRawUnsafe<
        Array<{ id: string; title: string; summary: string | null; subjectName: string | null; distance: number | string }>
      >(sql, ...params);

      let results: SimilarNodeResult[] = rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary || '',
        subjectName: row.subjectName || '',
        // cosine distance → similarity（0-1，越大越相似）
        score: Math.round((1 - Number(row.distance)) * 100) / 100,
      }));

      // 向量覆盖不到的部分（无 embedding 的存量节点）按关键词补足
      if (results.length < limit) {
        const fillers = await keywordSearchNodes(
          query,
          limit - results.length,
          subjectId,
          new Set(results.map((r) => r.id)),
        );
        results = [...results, ...fillers];
      }
      if (results.length > 0) return results;
      // 库内还没有任何 embedding（未回填）→ 落到关键词检索
    } catch (error: unknown) {
      // 向量查询失败（如 pgvector 扩展缺失）不阻断搜索，回退关键词
      console.warn('[searchSimilarNodes] vector search failed, fallback to keyword:', error);
    }
  }

  return keywordSearchNodes(query, limit, subjectId);
}
