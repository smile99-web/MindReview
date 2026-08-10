import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/secrets';

/**
 * 火山方舟统一调用（Agent Plan 订阅）：一个 API Key 走方舟 OpenAI 兼容端点
 * 调用 LLM / 视觉 / 图片 / 向量 / TTS 全部模型。
 *
 * 配置存 ApiKey 表 service='ark' 行：
 *   key      → 方舟 API Key（加密存储）
 *   baseUrl  → 方舟 base URL（默认 https://ark.cn-beijing.volces.com/api/v3）
 *   model    → JSON 字符串，各任务的模型 ID 覆盖（缺省字段用 ARK_DEFAULT_MODELS）
 *   isActive → 总开关：true 时所有 AI 调用优先走方舟；false/无 key 时回退到
 *              各服务独立配置（llm/tts/image/embedding/vision 行，即备选方案）
 */

export interface ArkModels {
  llm: string;
  vision: string;
  image: string;
  embedding: string;
  tts: string;
  voice: string;
}

export const ARK_DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/plan/v3';

/**
 * Agent Plan 的 TTS 不在方舟 OpenAI 兼容端点上，走 openspeech V3 协议
 * （与独立 OpenSpeech 同一协议，路径多一段 /plan，用 Plan Key 鉴权）
 */
export const ARK_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/plan/tts/unidirectional';

// Agent Plan 套餐内使用模型别名（非带日期的 Model ID）
export const ARK_DEFAULT_MODELS: ArkModels = {
  llm: 'doubao-seed-2.1-turbo',
  vision: 'doubao-seed-2.1-turbo',
  image: 'doubao-seedream-5.0-lite',
  embedding: 'doubao-embedding-vision',
  tts: 'seed-tts-2.0', // TTS Resource ID（非模型 ID）
  voice: 'zh_female_vv_uranus_bigtts',
};

export interface ArkConfig {
  apiKey: string;
  baseUrl: string;
  models: ArkModels;
}

/** model 列存 JSON；容忍旧数据/手写值：非 JSON 字符串视为只覆盖了 llm 模型 */
export function parseArkModels(raw: string | null | undefined): ArkModels {
  if (!raw) return { ...ARK_DEFAULT_MODELS };
  try {
    const obj = JSON.parse(raw) as Partial<ArkModels>;
    return {
      llm: obj.llm || ARK_DEFAULT_MODELS.llm,
      vision: obj.vision || ARK_DEFAULT_MODELS.vision,
      image: obj.image || ARK_DEFAULT_MODELS.image,
      embedding: obj.embedding || ARK_DEFAULT_MODELS.embedding,
      tts: obj.tts || ARK_DEFAULT_MODELS.tts,
      voice: obj.voice || ARK_DEFAULT_MODELS.voice,
    };
  } catch {
    return { ...ARK_DEFAULT_MODELS, llm: raw };
  }
}

/**
 * 读取方舟统一配置。返回 null 表示未启用（行不存在 / 关闭 / 无 key），
 * 调用方此时回退到各服务独立配置。
 */
export async function getArkConfig(): Promise<ArkConfig | null> {
  const row = await prisma.apiKey
    .findUnique({ where: { service: 'ark' } })
    .catch(() => null);
  if (!row?.isActive || !row.key) return null;
  return {
    apiKey: decryptSecret(row.key),
    baseUrl: row.baseUrl || ARK_DEFAULT_BASE_URL,
    models: parseArkModels(row.model),
  };
}
