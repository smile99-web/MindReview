interface TTSOptions {
  text: string;
  voiceType?: string;
  apiKey?: string;
  resourceId?: string;
  throwOnError?: boolean;
}

interface TTSResponse {
  audioUrl: string;
  durationMs?: number;
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
    throwOnError = false,
  } = options;

  if (!apiKey) {
    const message = 'Missing Doubao TTS API key';
    if (throwOnError) throw new Error(message);
    console.warn(`[TTS] ${message}, returning placeholder`);
    return { audioUrl: '' };
  }

  try {
    const response = await fetch(TTS_ENDPOINT, {
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
