import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { generateQuestions } from '@/lib/llm-client';
import type { GenerateQuestionsResult } from '@/lib/llm-client';
import { splitIntoPoints } from '@/lib/answer-points';

type QuestionTypeConfig = {
  type: string; // 'multiple_choice' | 'fill_blank' | 'short_answer'
  label: string; // 显示名
  count: number; // 每种题型出几道
};

// POST /api/doc/practice
// Body: { docId: string }
// Returns: { questions: [{ questionType, stem, options?, answer, explanation }] }
//
// 根据拆解出的知识点数量自动分配题型比例：
// - 选择题 50%（4 个选项）
// - 填空题 30%（___ 标记）
// - 问答题 20%（开放式简答）
//
// 例如 10 个知识点 → 5 选择 + 3 填空 + 2 问答 = 10 道。
// 最少 3 道（知识点 < 3 时），各题型上限 20/10/10 防 LLM 超时。
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const body = (await req.json().catch(() => ({}))) as {
      docId?: unknown;
      types?: QuestionTypeConfig[];
    };
    const docId = typeof body.docId === 'string' ? body.docId.trim() : '';
    if (!docId) {
      return NextResponse.json({ error: 'docId is required' }, { status: 400 });
    }

    const doc = await prisma.docUpload.findUnique({
      where: { id: docId },
      select: {
        userId: true,
        fileName: true,
        content: true,
        subjectName: true,
        knowledgePoints: true,
      },
    });
    if (!doc) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    if (doc.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    // 按知识点数量分配题型比例：选择 50% / 填空 30% / 问答 20%。
    // 有 10 个知识点 → 5 选择 + 3 填空 + 2 问答 = 10 题。
    const kpNodes = (doc.knowledgePoints as { nodes?: Array<{ title?: string }> }) || {};
    const total = Math.max(3, (kpNodes.nodes || []).length);
    const mc = Math.floor(total * 0.5);
    const fb = Math.floor(total * 0.3);
    const sa = total - mc - fb; // remainder to short_answer

    const typesToGenerate: QuestionTypeConfig[] = [
      { type: 'multiple_choice', label: '选择题', count: Math.min(20, mc) },
      { type: 'fill_blank', label: '填空题', count: Math.min(10, fb) },
      { type: 'short_answer', label: '问答题', count: Math.min(10, sa) },
    ];

    // Build a conditioning snippet from the file content that tells
    // the LLM what the material is about.
    const kp = (doc.knowledgePoints as { nodes?: Array<{ title?: string; summary?: string }> }) || {};
    const kpSummary = (kp.nodes || [])
      .map((n) => `${n.title || ''}: ${n.summary || ''}`)
      .join('\n');

    const allQuestions: Array<Record<string, unknown>> = [];

    // Single LLM call for all question types — the original 3-call
    // Promise.all waited for the slowest (often 30s+), and the UI
    // hung at "出题中..." until every question was in.
    //
    // Now we build one prompt listing each type + count, and the LLM
    // returns all questions at once with a `questionType` key per
    // item. 1 call instead of 3; results arrive together but
    // wall-clock latency ≈ max-of-three → single-call (~10s).
    const docTitle = doc.fileName?.replace(/\.\w+$/, '') || '上传文件';
    const knowledgeSummary =
      kpSummary || doc.content.slice(0, 400) || '教材内容';
    const subject = doc.subjectName || '通用';

    const typeSpecs = typesToGenerate
      .map((t) => `${t.count} 道 ${t.label}（questionType="multiple_choice"）`)
      .join('；');

    const mixedPrompt =
      '你是一位中学' + subject + '出题专家。请根据知识点生成以下题目：\n\n' +
      typesToGenerate.map(function(t) { return '- ' + t.count + ' 道' + t.label + '（questionType="' + t.type + '"）'; }).join('\n') +
      '\n\n=== 格式要求 ===\n' +
      '- 选择题：4 个选项 A/B/C/D，answer=字母\n' +
      '- 填空题：___ 标记空缺，answer=简短\n' +
      '- 问答题：开放式题干，answer=3-6 句段落，禁止配 options\n\n' +
      '=== JSON 示例 ===\n' +
      '{"questions": [' +
      '{"questionType": "multiple_choice", "stem": "...", "options": [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}, {"label": "C", "text": "..."}, {"label": "D", "text": "..."}], "answer": "C", "explanation": "...", "difficulty": 3},' +
      '{"questionType": "fill_blank", "stem": "______是光合作用的原料之一。", "answer": "水", "explanation": "...", "difficulty": 3},' +
      '{"questionType": "short_answer", "stem": "请解释……", "answer": "参考答案段落", "explanation": "...", "difficulty": 3}' +
      ']}\n\n' +
      '只输出 JSON，不附加解释。每题 difficulty 1-5。';

    const mixedResult = await generateQuestions(
      docTitle,
      knowledgeSummary,
      subject,
      mixedPrompt,
      'Active',
      typesToGenerate.reduce((s, t) => s + t.count, 0),
    );

    // Tag each question with its type from the LLM response, then
    // normalize the same way the old per-type map did.
    for (const q of mixedResult.questions || []) {
      const qType = (q as { questionType?: string }).questionType || 'multiple_choice';
      allQuestions.push({
        questionType: qType,
        stem: q.stem || (q as { question?: string }).question || '',
        options: qType === 'multiple_choice' ? (q.options || []) : undefined,
        answer: q.answer || '',
        points: qType === 'short_answer' ? splitIntoPoints(q.answer || '') : undefined,
        explanation: q.explanation || '',
        difficulty: q.difficulty || 3,
        cognitiveLoad: q.cognitiveLoad || 3,
      });
    }

    await prisma.docUpload.update({
      where: { id: docId },
      data: { practiceQuestions: allQuestions as unknown as object },
    });

    return NextResponse.json({ questions: allQuestions });
  } catch (error: unknown) {
    console.error('[doc/practice] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
