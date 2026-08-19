import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { decomposeKnowledge, llmCall } from '@/lib/llm-client';
import type { DecomposeKnowledgeResult } from '@/lib/llm-client';

// POST /api/doc/analyze
// Body: { docId: string, subject?: string }
// Returns: { knowledgePoints: [...], subjectName: string }
//
// Two-step LLM pipeline:
//   a) Quick subject classification (single-token call) if the
//      caller didn't supply a subject, so we don't feed the wrong
//      subject name into the expensive decomposeKnowledge prompt.
//   b) Full decomposeKnowledge call, same as the textbook generator.
//
// The result is persisted to DocUpload.knowledgePoints.
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const body = (await req.json().catch(() => null)) as { docId?: unknown; subject?: unknown } | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const docId = typeof body.docId === 'string' ? body.docId.trim() : '';
    if (!docId) {
      return NextResponse.json({ error: 'docId is required' }, { status: 400 });
    }

    const doc = await prisma.docUpload.findUnique({
      where: { id: docId },
      select: { userId: true, content: true, subjectName: true, fileName: true },
    });
    if (!doc) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    if (doc.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    let subject = (typeof body.subject === 'string' ? body.subject.trim() : '') || doc.subjectName || '';

    // If the caller didn't guess and we don't have one cached, do a
    // quick (cheap) classification call before the expensive decompose.
    if (!subject) {
      // Sample the first 300 chars to classify — enough signal for
      // the LLM to pick 数学 vs 物理 vs 历史 etc. without burning
      // the full token budget decomposeKnowledge needs.
      const snippet = doc.content.slice(0, 300).replace(/\s+/g, ' ');
      const raw = await llmCall({
        messages: [
          {
            role: 'system',
            content:
              '你是一位中学学科分类助手。根据文本内容，判断它最可能属于哪个学科。只回复一个学科名（数学/物理/化学/历史/道法/语文/地理/生物/英语/通用），不回复其他文字。',
          },
          { role: 'user', content: `文本片段：${snippet}` },
        ],
        temperature: 0,
        maxTokens: 16,
      });
      subject = raw.trim();
      if (!subject) subject = '通用';
    }

    const result = await decomposeKnowledge(
      subject,
      '通用',
      doc.fileName?.replace(/\.\w+$/, '') || '上传文件',
      doc.content.slice(0, 2000), // 2k chars is enough context for decompose; larger → LLM returns huge JSON that hits maxTokens
    );

    const knowledgePoints: DecomposeKnowledgeResult = {
      nodes: (result.nodes || []).map((n) => ({
        title: n.title || '',
        summary: n.summary || '',
        keywords: n.keywords || [],
        prerequisites: n.prerequisites || [],
        commonMistakes: n.commonMistakes || [],
        typicalQuestions: n.typicalQuestions || [],
        difficulty: typeof n.difficulty === 'number' ? n.difficulty : 3,
        cognitiveLoad: typeof n.cognitiveLoad === 'number' ? n.cognitiveLoad : 3,
        icapLevel: n.icapLevel || 'Active',
      })),
      edges: result.edges || [],
    };

    await prisma.docUpload.update({
      where: { id: docId },
      data: {
        subjectName: subject,
        knowledgePoints: knowledgePoints as unknown as object,
      },
    });

    return NextResponse.json({ knowledgePoints, subjectName: subject });
  } catch (error: unknown) {
    console.error('[doc/analyze] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: getErrorStatus(error) },
    );
  }
}
