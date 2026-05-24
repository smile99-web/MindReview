interface TTSOptions {
  text: string;
  voiceType?: string;
}

interface TTSResponse {
  audioUrl: string;
  durationMs?: number;
}

const APP_ID = process.env.DOUBAO_TTS_APP_ID || '';
const ACCESS_TOKEN = process.env.DOUBAO_TTS_ACCESS_TOKEN || '';
const CLUSTER = process.env.DOUBAO_TTS_CLUSTER || 'volcano_tts';
const DEFAULT_VOICE = process.env.DOUBAO_TTS_VOICE_TYPE || 'zh_female_qingxin';

/**
 * 豆包语音 TTS Client
 * 使用火山引擎语音合成API
 * 参考: https://www.volcengine.com/docs/6561/79820
 */
export async function synthesizeSpeech(options: TTSOptions): Promise<TTSResponse> {
  const { text, voiceType = DEFAULT_VOICE } = options;

  if (!APP_ID || !ACCESS_TOKEN) {
    console.warn('[TTS] Missing DOUBAO_TTS_APP_ID or DOUBAO_TTS_ACCESS_TOKEN, returning placeholder');
    return { audioUrl: '' };
  }

  try {
    // 火山引擎 TTS HTTP API
    const response = await fetch('https://openspeech.bytedance.com/api/v1/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer;${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        app: { appid: APP_ID, token: 'placeholder', cluster: CLUSTER },
        user: { uid: 'mindreview-user' },
        audio: {
          voice_type: voiceType,
          encoding: 'mp3',
          speed_ratio: 1.0,
          volume_ratio: 1.0,
          pitch_ratio: 1.0,
        },
        request: {
          reqid: generateReqId(),
          text: text,
          text_type: 'plain',
          operation: 'query',
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[TTS] API error:', response.status, errBody);
      throw new Error(`TTS API返回错误: ${response.status}`);
    }

    const data = await response.json();
    const audioData = data.audio; // base64 audio

    if (!audioData) {
      throw new Error('TTS API未返回音频数据');
    }

    // 在实际部署中，这里应该将音频保存到文件系统或OSS
    // 这里返回 base64 data URL 作为简化实现
    const audioUrl = `data:audio/mp3;base64,${audioData}`;

    return {
      audioUrl,
      durationMs: data.duration ? Math.round(parseFloat(data.duration) * 1000) : undefined,
    };
  } catch (error: any) {
    console.error('[TTS] Error:', error.message);
    // Fallback: 返回空URL，前端显示"TTS不可用"
    return { audioUrl: '' };
  }
}

/**
 * 将知识内容批量转为语音
 */
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

function generateReqId(): string {
  return `mindreview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
