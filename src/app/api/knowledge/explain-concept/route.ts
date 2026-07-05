import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { llmCall } from '@/lib/llm-client';

// POST /api/knowledge/explain-concept
// Body: { concept: string, subject?: string, contextTitle?: string }
// Returns: { nodeId, title, summary, keywords }
//
// Called when a user clicks a prerequisite link in KnowledgeCardView.
// The LLM generates a hyper-friendly, example-rich explanation of the
// concept, then a KnowledgeNode is created and the client redirects to
// /cards/[nodeId] for ICAP training.
//
// Idempotent: a node with the same title (exact match on subject +
// concept) is reused on the second click.
export async function POST(req: NextRequest) {
  try {
    await resolveUserIdFromRequest(req);
    const body = (await req.json()) as {
      concept?: string;
      subject?: string;
      contextTitle?: string;
    };

    const concept = (body.concept || '').trim();
    if (!concept) {
      return NextResponse.json({ error: 'concept is required' }, { status: 400 });
    }
    const subject = (body.subject || '通用').trim();
    const context = (body.contextTitle || '').trim();

    // Build the title: "[subject] concept" so it's unique per subject
    const title = `[${subject}] ${concept}`;
    const existing = await prisma.knowledgeNode.findFirst({
      where: { title },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ nodeId: existing.id, reused: true, title });
    }

    // Ask the LLM for a friendly explanation.
    // Temperature 0.6 gives variety without going off-track.
    // JSON mode ensures structured output for keywords + summary.
    const contextHint = context
      ? ` 前置知识属于${context}这个知识点的一部分。请围绕${concept}在${context}的语境下解释。`
      : '';

    const systemPrompt =
      `你是一位充满耐心的中学${subject}老师。学生正在学习「前置知识」，需要你解释一个基础概念。

要求：
- 用最通俗易懂的语言，像讲故事一样解释这个概念。
- **必须包含至少一个贴近生活的例子**，让抽象概念变得具体。
- 总结写到 summary 字段（80-150字）。
- 关键词写到 keywords 数组（4-8 个）。
- 难度 difficulty 和认知负荷 cognitiveLoad 是 1-5。

输出严格 JSON：
{"summary": "通俗解释，包含生活例子", "keywords": ["关键词1", "关键词2"], "difficulty": 2, "cognitiveLoad": 2}`;

    const userPrompt = `概念：${concept}
学科：${subject}${contextHint}`;

    const raw = await llmCall({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.6,
      maxTokens: 800,
      jsonMode: true,
    });

    let parsed: { summary?: string; keywords?: string[]; difficulty?: number; cognitiveLoad?: number } = {};
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch { parsed = {}; }
    }

    const summary = (parsed.summary || `请学习概念：${concept}`).trim();
    const keywords = Array.from(new Set([
      ...(Array.isArray(parsed.keywords) ? parsed.keywords : [concept]),
      concept,
      subject,
    ])).slice(0, 10);
    const difficulty = typeof parsed.difficulty === 'number' ? Math.max(1, Math.min(5, parsed.difficulty)) : 3;
    const cognitiveLoad = typeof parsed.cognitiveLoad === 'number' ? Math.max(1, Math.min(5, parsed.cognitiveLoad)) : 3;

    // Resolve subject
    let subjectId: string;
    const existingSubject = await prisma.subject.findFirst({ where: { name: subject }, select: { id: true } });
    if (existingSubject) {
      subjectId = existingSubject.id;
    } else {
      const newSubj = await prisma.subject.upsert({ where: { name: '通用' }, update: {}, create: { name: '通用', icon: '📝' }, select: { id: true } });
      subjectId = newSubj.id;
    }

    const node = await prisma.knowledgeNode.create({
      data: {
        subjectId,
        title,
        summary,
        keywords,
        difficulty,
        cognitiveLoad,
        icapLevel: 'Active',
      },
      select: { id: true, title: true, summary: true, keywords: true },
    });

    return NextResponse.json({
      nodeId: node.id,
      title: node.title,
      summary: node.summary,
      keywords: node.keywords,
      reused: false,
    });
  } catch (error: unknown) {
    console.error('[knowledge/explain-concept] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
