import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import {
  designConstructiveTask,
  designInteractiveTask,
  validateExplanation,
} from '@/lib/icap-enhancer';
import { detectCognitiveGaps } from '@/lib/ai-tutor';

export const dynamic = 'force-dynamic';

type IcapAction =
  | 'designConstructiveTask'
  | 'designInteractiveTask'
  | 'validateExplanation'
  | 'detectCognitiveGaps';

interface IcapRequestBody {
  action?: IcapAction;
  knowledgeNodeId?: string;
  response?: string;
  difficulty?: string;
}

async function loadKnowledgeNode(knowledgeNodeId: string) {
  return prisma.knowledgeNode.findUnique({
    where: { id: knowledgeNodeId },
    select: {
      id: true,
      title: true,
      summary: true,
      subject: { select: { name: true } },
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    await resolveUserIdFromRequest(req);

    const body = (await req.json()) as IcapRequestBody;
    const { action, knowledgeNodeId } = body;

    if (!action) {
      return NextResponse.json({ error: '缺少 action' }, { status: 400 });
    }

    if (!knowledgeNodeId) {
      return NextResponse.json({ error: '缺少 knowledgeNodeId' }, { status: 400 });
    }

    const node = await loadKnowledgeNode(knowledgeNodeId);
    if (!node) {
      return NextResponse.json({ error: '知识点不存在' }, { status: 404 });
    }

    const subject = node.subject?.name || '通用';
    const summary = node.summary || null;

    if (action === 'designConstructiveTask') {
      const constructiveTask = await designConstructiveTask(node.title, summary, subject);
      return NextResponse.json({ constructiveTask });
    }

    if (action === 'designInteractiveTask') {
      const interactiveTask = await designInteractiveTask(
        node.title,
        summary,
        body.difficulty || 'intermediate',
        subject,
      );
      return NextResponse.json({ interactiveTask });
    }

    if (action === 'validateExplanation') {
      if (!body.response?.trim()) {
        return NextResponse.json({ error: '缺少 response' }, { status: 400 });
      }

      const validation = await validateExplanation(
        body.response.trim(),
        node.title,
        summary,
        subject,
      );
      return NextResponse.json({ validation });
    }

    if (action === 'detectCognitiveGaps') {
      if (!body.response?.trim()) {
        return NextResponse.json({ error: '缺少 response' }, { status: 400 });
      }

      const gaps = await detectCognitiveGaps(
        body.response.trim(),
        node.title,
        node.summary || '',
      );
      return NextResponse.json({ gaps });
    }

    return NextResponse.json({ error: '不支持的 action' }, { status: 400 });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    const status = message === 'Authentication required' ? 401 : 500;
    console.error('[ICAP API]', error);
    return NextResponse.json({ error: message }, { status });
  }
}
