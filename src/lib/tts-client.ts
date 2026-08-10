import { ARK_TTS_ENDPOINT, getArkConfig } from '@/lib/ark';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/secrets';

interface TTSOptions {
  text: string;
  voiceType?: string;
  apiKey?: string;
  resourceId?: string;
  /** Agent Plan 时传 /plan 路径端点；默认 OpenSpeech 后付费端点 */
  endpoint?: string;
  throwOnError?: boolean;
}

interface TTSResponse {
  audioUrl: string;
  durationMs?: number;
}

/**
 * TTS 运行时配置：方舟 Agent Plan（同一 openspeech V3 协议，/plan 路径 +
 * Plan Key）或独立豆包 OpenSpeech（备选）。由 resolveTtsConfig() 按设置页
 * "火山方舟 Agent Plan"开关决定。
 */
export interface ResolvedTtsConfig {
  mode: 'ark' | 'openspeech';
  apiKey: string | undefined;
  endpoint: string;
  resourceId: string;
  voice: string;
}

interface DoubaoStreamFrame {
  code?: number;
  message?: string;
  data?: string;
  duration?: number | string;
}

const API_KEY = process.env.DOUBAO_TTS_API_KEY || process.env.DOUBAO_TTS_ACCESS_TOKEN || '';
const RESOURCE_ID = process.env.DOUBAO_TTS_RESOURCE_ID || 'seed-tts-2.0';
const DEFAULT_VOICE = process.env.DOUBAO_TTS_VOICE_TYPE || 'zh_female_vv_uranus_bigtts';
const TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';

function generateReqId(): string {
  return `mindreview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseConcatenatedJson(raw: string): DoubaoStreamFrame[] {
  const frames: DoubaoStreamFrame[] = [];
  let index = 0;

  while (index < raw.length) {
    while (index < raw.length && /\s/.test(raw[index])) index += 1;
    if (index >= raw.length) break;

    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = index;

    for (; end < raw.length; end += 1) {
      const char = raw[end];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }

    if (end <= index) break;
    frames.push(JSON.parse(raw.slice(index, end)) as DoubaoStreamFrame);
    index = end;
  }

  return frames;
}

function extractAudio(frames: DoubaoStreamFrame[]): { base64: string; durationMs?: number } {
  const chunks = frames
    .map((frame) => frame.data)
    .filter((data): data is string => typeof data === 'string' && data.length > 0);

  const finalFrame = [...frames].reverse().find((frame) => frame.code !== undefined);
  if (finalFrame && finalFrame.code !== 20000000) {
    throw new Error(finalFrame.message || `Doubao TTS returned code ${finalFrame.code}`);
  }

  if (chunks.length === 0) {
    throw new Error('Doubao TTS did not return audio data');
  }

  const duration = frames.find((frame) => frame.duration !== undefined)?.duration;
  return {
    base64: chunks.join(''),
    durationMs: duration === undefined ? undefined : Math.round(Number(duration) * 1000),
  };
}

export async function synthesizeSpeech(options: TTSOptions): Promise<TTSResponse> {
  const {
    text,
    voiceType = DEFAULT_VOICE,
    apiKey = API_KEY,
    resourceId = RESOURCE_ID,
    endpoint = TTS_ENDPOINT,
    throwOnError = false,
  } = options;

  if (!apiKey) {
    const message = 'Missing Doubao TTS API key';
    if (throwOnError) throw new Error(message);
    console.warn(`[TTS] ${message}, returning placeholder`);
    return { audioUrl: '' };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'X-Api-Resource-Id': resourceId,
        'X-Api-Request-Id': generateReqId(),
      },
      body: JSON.stringify({
        user: { uid: 'mindreview-user' },
        req_params: {
          text,
          speaker: voiceType,
          audio_params: {
            format: 'mp3',
            sample_rate: 24000,
          },
        },
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      const logId = response.headers.get('X-Tt-Logid');
      if (response.status === 401) {
        throw new Error(`豆包 TTS 鉴权失败，请确认 API Key 和 Resource ID (${resourceId}) 是否匹配${logId ? `，logid=${logId}` : ''}`);
      }
      throw new Error(`Doubao TTS HTTP ${response.status}${logId ? `, logid=${logId}` : ''}: ${raw.slice(0, 300)}`);
    }

    const { base64, durationMs } = extractAudio(parseConcatenatedJson(raw));
    return {
      audioUrl: `data:audio/mp3;base64,${base64}`,
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown TTS error';
    if (throwOnError) throw new Error(message);
    console.error('[TTS] Error:', message);
    return { audioUrl: '' };
  }
}

export async function batchSynthesize(
  items: { text: string; id: string }[],
  voiceType?: string,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (const item of items) {
    try {
      const { audioUrl } = await synthesizeSpeech({ text: item.text, voiceType });
      results.set(item.id, audioUrl);
    } catch {
      results.set(item.id, '');
    }
  }

  return results;
}

/**
 * 决定当前 TTS 走哪条通道：方舟 Agent Plan 开启且有 key → ark
 * （同一 V3 协议，/plan 路径 + Plan Key）；否则读 ApiKey 表 'tts' 行 +
 * 环境变量（原有 OpenSpeech 备选方案）。voiceOverride 优先于一切已存配置。
 */
export async function resolveTtsConfig(voiceOverride?: string): Promise<ResolvedTtsConfig> {
  const ark = await getArkConfig();
  if (ark) {
    return {
      mode: 'ark',
      apiKey: ark.apiKey,
      endpoint: ARK_TTS_ENDPOINT,
      resourceId: ark.models.tts,
      voice: voiceOverride || ark.models.voice,
    };
  }

  const saved = await prisma.apiKey.findUnique({ where: { service: 'tts' } }).catch(() => null);
  return {
    mode: 'openspeech',
    apiKey: saved?.key ? decryptSecret(saved.key) : undefined,
    endpoint: TTS_ENDPOINT,
    resourceId: saved?.baseUrl || RESOURCE_ID,
    voice: voiceOverride || saved?.model || DEFAULT_VOICE,
  };
}

/**
 * 按 resolveTtsConfig 的结果自动选择通道合成语音。
 * 新调用点统一用这个，不要在路由里手写配置读取。
 */
export async function synthesizeSpeechAuto(options: {
  text: string;
  voiceType?: string;
}): Promise<TTSResponse & { engine: string }> {
  const config = await resolveTtsConfig(options.voiceType);
  const result = await synthesizeSpeech({
    text: options.text,
    voiceType: config.voice,
    apiKey: config.apiKey,
    resourceId: config.resourceId,
    endpoint: config.endpoint,
    throwOnError: true,
  });
  const engine = `${config.mode === 'ark' ? 'ark:' : ''}${config.resourceId}:${config.voice}`;
  return { ...result, engine };
}
