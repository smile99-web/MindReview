import { NextRequest, NextResponse } from 'next/server';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { llmCallWithLog } from '@/lib/llm-client';
import { prisma } from '@/lib/prisma';
import { SUBJECT_CONFIG } from '@/types';
import type { SubjectName } from '@/types';

const GRADES = new Set(['初一', '初二', '初三', '高一', '高二', '高三']);
const VOLUMES = new Set(['上册', '下册', '全册']);

// POST /api/textbook/chapter-list
// Body: { subject, grade, volume }
// Returns: { candidates: [{ title, overview }], editionNote, confidence }
//
// Step 1 of the textbook generation flow. Asks the LLM for the
// "latest 人教版 (People's Education Press)" chapter list for the
// given subject+grade+volume. The user then confirms/edits the
// list before Step 2 (knowledge generation) runs — this lets
// the user fix any 旧教材 / 地区版差异.
//
// The LLM also returns a self-rated confidence so the UI can warn
// the user when the model isn't sure (e.g. for subjects where
// curriculum revisions happen frequently).
export async function POST(req: NextRequest) {
  try {
    // Auth gate — read-only.
    await resolveUserIdFromRequest(req);

    const body = (await req.json()) as {
      subject?: string;
      grade?: string;
      volume?: string;
    };

    const subject = String(body.subject || '').trim();
    const grade = String(body.grade || '').trim();
    const volume = String(body.volume || '').trim();

    if (!subject || !GRADES.has(grade) || !VOLUMES.has(volume)) {
      return NextResponse.json(
        { error: '参数无效：学科、年级、册别都必填且必须在白名单内' },
        { status: 400 },
      );
    }

    // 跨年级禁词提示（防 AI 跨年级混内容）
    const gradeVolumeKey = `${grade}${volume}`;
    const forbiddenWords = getForbiddenWords(gradeVolumeKey);
    const forbiddenHint = forbiddenWords.length > 0
      ? `\n特别提示：${grade}${volume} 不应包含以下概念：${forbiddenWords.join('、')}。`
      : '';

    const systemPrompt = `你是一位熟悉人民教育出版社（人教版）教材的资深教研员。

任务：列出 "${grade}${subject}${volume}" 的最新人教版章节目录。

要求：
- 优先依据"最新人教版"教材（2024 修订版或更新）。
- 上册/下册 5-8 章；全册 8-12 章。
- 每章 title 简洁（一行），overview 一句话描述本章内容（30-60字）。
- 如果你对该学科的最新版本不确定（地区差异、版本更新中），在 confidence
  字段返回 "low"，让用户手动对照实体教材。
- 如果你比较确定是最新人教版目录，返回 "high"。
- 中间情况 "medium"。
${forbiddenHint}

输出严格 JSON：
{
  "editionNote": "版本/范围说明（30字内）",
  "confidence": "high" | "medium" | "low",
  "candidates": [
    { "title": "章节标题", "overview": "本章内容概述" }
  ]
}`;

    const userPrompt = `请列出：
学科：${subject}
年级：${grade}
册别：${volume}`;

    const raw = await llmCallWithLog(
      {
        generatorType: 'textbook_chapter_list',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        maxTokens: 1500,
        jsonMode: true,
      },
      prisma,
    );

    if (!raw || !raw.trim()) {
      throw new Error('AI 返回内容为空 — 请检查 API Key 和网络');
    }

    let parsed: { candidates?: { title?: string; overview?: string }[]; editionNote?: string; confidence?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 容错：提取首段 {...} 块
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('AI 返回非 JSON 格式');
      parsed = JSON.parse(m[0]);
    }

    const raw2 = parsed.candidates || [];
    const candidates = raw2
      .map((c) => ({ title: String(c.title || '').trim(), overview: String(c.overview || '').trim() }))
      .filter((c) => c.title.length > 0)
      .slice(0, 12);

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: 'AI 未列出任何单元，请稍后重试或换个学科年级试试' },
        { status: 422 },
      );
    }

    return NextResponse.json({
      candidates,
      editionNote: String(parsed.editionNote || '').slice(0, 200),
      confidence: ['high', 'medium', 'low'].includes(String(parsed.confidence))
        ? (String(parsed.confidence) as 'high' | 'medium' | 'low')
        : 'medium',
    });
  } catch (error: unknown) {
    console.error('[textbook/chapter-list] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

// 跨年级禁词：与 generate/route.ts 里的 GRADE_CHAPTER_RANGES 对应
function getForbiddenWords(gradeVolume: string): string[] {
  const map: Record<string, string[]> = {
    '初一上册': ['一元二次方程', '二次函数', '反比例函数', '相似', '锐角三角函数', '圆', '投影', '视图'],
    '初一下册': ['一元二次方程', '二次函数', '相似', '锐角三角函数', '圆', '投影', '视图', '全等三角形', '轴对称', '分式', '二次根式', '勾股定理', '平行四边形', '一次函数', '数据分析'],
    '初二上册': ['一元二次方程', '二次函数', '反比例函数', '相似', '锐角三角函数', '圆', '投影', '视图'],
    '初二下册': ['一元二次方程', '二次函数', '反比例函数', '相似', '锐角三角函数', '圆', '投影'],
    '初三上册': ['相交线与平行线', '实数', '二元一次方程组', '不等式', '整式', '三角形全等', '轴对称', '分式', '二次根式', '勾股定理'],
    '初三下册': ['一元二次方程', '二次函数', '旋转', '圆', '概率初步'],
    '初一全册': ['一元二次方程', '二次函数', '反比例函数', '相似', '锐角三角函数', '圆', '投影', '视图', '全等三角形', '轴对称', '分式', '二次根式', '勾股定理', '平行四边形', '一次函数', '数据分析'],
    '初二全册': ['一元二次方程', '二次函数', '反比例函数', '相似', '锐角三角函数', '圆', '投影', '视图'],
    '初三全册': ['相交线与平行线', '实数', '二元一次方程组', '不等式', '整式', '三角形全等', '轴对称', '分式', '二次根式', '勾股定理'],
  };
  return map[gradeVolume] || [];
}
