import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { rateLimit } from '@/lib/rate-limit';
import {
  detectRepresentationType,
  generateRepresentationContent,
  saveRepresentation,
} from '@/lib/representation-engine';

// POST /api/representation/generate
// 生成表征内容（可指定类型或自动检测）
// Body: { knowledgeNodeId: string, representationType?: string }
export async function POST(req: NextRequest) {
  try {
    // Require auth — this route triggers an LLM call ($$$). Without this
    // check, any caller that slipped past the proxy could burn API quota.
    const userId = await resolveUserIdFromRequest(req);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const { knowledgeNodeId, representationType } = body;

    if (!knowledgeNodeId) {
      return NextResponse.json(
        { error: '缺少必填字段: knowledgeNodeId' },
        { status: 400 },
      );
    }

    // 1. 获取知识点
    const node = await prisma.knowledgeNode.findUnique({
      where: { id: knowledgeNodeId },
      include: { subject: { select: { name: true } } },
    });

    if (!node) {
      return NextResponse.json(
        { error: '知识点不存在' },
        { status: 404 },
      );
    }

    const subject = node.subject?.name || '';
    const nodeTitle = node.title || '';
    const nodeSummary = node.summary || '';
    const keywords = node.keywords || [];

    // 2. 确定表征类型（优先使用传入的，否则自动检测）。
    //    传入值做白名单校验：非法类型会在引擎里静默落 concept_map 数据
    //    却按传入类型落库（脏数据）。
    const VALID_TYPES = new Set([
      'formula', 'image', 'step', 'timeline', 'causal', 'force', 'reaction',
      'mindmap', 'template', 'comparison', 'concept_map',
      'text', 'poem', 'essay', 'classical', 'concept', 'experiment', 'particle',
      'classification', 'figure', 'event', 'keyword', 'viewpoint',
      'map', 'climate', 'physical', 'human', 'regional', 'process', 'diagram',
    ]);
    let repType = typeof representationType === 'string' && VALID_TYPES.has(representationType)
      ? representationType
      : '';

    // 表征缓存：请求类型与已存类型一致且未强制重生成时直接返回，
    // 不重复调付费 LLM。注意顺序：缓存判断必须在限流之前——
    // 命中缓存的请求不烧 LLM 配额。
    const force = (body as { force?: unknown }).force === true;
    if (
      !force &&
      repType &&
      node.representationType === repType &&
      node.representationData
    ) {
      return NextResponse.json({
        success: true,
        nodeId: knowledgeNodeId,
        representationType: node.representationType,
        representationData: node.representationData,
        cached: true,
      });
    }

    // 限流：每次真实生成都是付费 LLM 调用（缓存命中不限）
    const rl = rateLimit(`llm:${userId}`, 60, 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'AI 调用太频繁了，请稍后再试' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    if (!repType) {
      repType = await detectRepresentationType(
        subject,
        nodeTitle,
        nodeSummary,
        keywords,
      );
    }

    // 3. 生成表征内容。保存的类型必须是实际生效类型（generated.type）：
    //    回退时数据是 concept_map 结构，配原 repType 落库就是脏数据。
    const generated = await generateRepresentationContent(
      nodeTitle,
      nodeSummary,
      subject,
      repType,
    );

    // 彻底失败的空壳数据不落库（否则被缓存层永久返回）
    if (generated.failed) {
      return NextResponse.json(
        { error: '表征生成失败（AI 服务暂不可用），请稍后重试' },
        { status: 502 },
      );
    }

    // 4. 保存到数据库
    await saveRepresentation(knowledgeNodeId, generated.type, generated.data);

    return NextResponse.json({
      success: true,
      nodeId: knowledgeNodeId,
      representationType: generated.type,
      representationData: generated.data,
    });
  } catch (error: unknown) {
    console.error('[Representation Generate] Error:', error);
    return NextResponse.json(
      { error: `表征生成失败: ${getErrorMessage(error)}` },
      { status: getErrorStatus(error) },
    );
  }
}
