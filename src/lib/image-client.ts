import { getErrorMessage } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/secrets';
import { assertSafeExternalBaseUrl } from '@/lib/url-security';

interface ImageGenerateOptions {
  prompt: string;
  imageType: 'knowledge' | 'experiment' | 'timeline' | 'force' | 'reaction' | 'portrait';
  size?: string;
  style?: string;
}

interface ImageGenerateResponse {
  imageUrl: string;
  prompt: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

const API_KEY = process.env.SEEDREAM_API_KEY || '';
const ENDPOINT = process.env.SEEDREAM_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3';
const MODEL = process.env.SEEDREAM_MODEL || 'doubao-seedream-5-0';

async function getImageSettings() {
  const saved = await prisma.apiKey.findUnique({ where: { service: 'image' } }).catch(() => null);
  const savedKey = saved?.isActive && saved.key ? decryptSecret(saved.key) : '';

  return {
    apiKey: savedKey || API_KEY,
    endpoint: assertSafeExternalBaseUrl(saved?.baseUrl || ENDPOINT),
    model: saved?.model || MODEL,
  };
}

/**
 * Doubao Seedream 图片生成 Client
 * 用于生成知识配图、实验示意图、历史事件图等
 */
export async function generateImage(options: ImageGenerateOptions): Promise<ImageGenerateResponse> {
  const { prompt, imageType, size = '1920x1920', style } = options;
  const settings = await getImageSettings();

  if (!settings.apiKey) {
    console.warn('[ImageGen] Missing SEEDREAM_API_KEY, returning placeholder');
    return {
      imageUrl: '',
      prompt,
      status: 'failed',
      errorMessage: '未配置SEEDREAM_API_KEY',
    };
  }

  try {
    const enhancedPrompt = enhancePrompt(prompt, imageType, style);

    const response = await fetch(`${settings.endpoint}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        prompt: enhancedPrompt,
        n: 1,
        size,
        response_format: 'url',
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[ImageGen] API error:', response.status, errBody);
      throw new Error(`图片生成API返回错误: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url || '';

    if (!imageUrl) {
      throw new Error('图片生成API未返回图片URL');
    }

    return {
      imageUrl,
      prompt: enhancedPrompt,
      status: 'success',
    };
  } catch (error: unknown) {
    console.error('[ImageGen] Error:', getErrorMessage(error));
    return {
      imageUrl: '',
      prompt,
      status: 'failed',
      errorMessage: getErrorMessage(error),
    };
  }
}

/**
 * 批量生成图片
 */
export async function batchGenerateImages(
  items: { prompt: string; imageType: ImageGenerateOptions['imageType']; id: string }[],
): Promise<Map<string, ImageGenerateResponse>> {
  const results = new Map<string, ImageGenerateResponse>();

  // 并发限制，每次最多3个
  const chunks = chunkArray(items, 3);

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(async (item) => {
        const result = await generateImage({
          prompt: item.prompt,
          imageType: item.imageType,
        });
        return { id: item.id, result };
      }),
    );

    for (const { id, result } of chunkResults) {
      results.set(id, result);
    }
  }

  return results;
}

function enhancePrompt(prompt: string, imageType: string, style?: string): string {
  const styleGuides: Record<string, string> = {
    knowledge: '清晰的教育插图风格，适合中学生理解，色彩鲜明，标注清晰',
    experiment: '科学实验示意图风格，展示实验装置和步骤，简洁明了',
    timeline: '历史时间线图风格，展示事件先后顺序和因果关系，清晰有序',
    force: '物理受力分析图风格，箭头标注清晰，力的方向和大小准确',
    reaction: '化学微观反应示意图，展示分子结构和反应过程，科学准确',
    portrait: '历史人物肖像风格，简洁大方，适合教学使用',
  };

  const baseStyle = styleGuides[imageType] || styleGuides.knowledge;
  const extraStyle = style ? `，${style}` : '';

  return `${prompt}，${baseStyle}${extraStyle}，中文标注`;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
