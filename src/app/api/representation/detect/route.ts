import { getErrorMessage, getErrorStatus } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { rateLimit } from '@/lib/rate-limit';
import type { Prisma } from '@prisma/client';
import {
  detectRepresentationType,
  generateRepresentationContent,
  saveRepresentation,
} from '@/lib/representation-engine';

// POST /api/representation/detect
// 自动检测表征类型、生成内容并保存
// Body: { knowledgeNodeId: string }
export async function POST(req: NextRequest) {
  try {
    // Require auth — this route triggers an LLM call ($$$). Previously any
    // caller that slipped past the proxy (or forged a JWT via the dev
    // secret) could burn the project owner's API quota.
    const userId = await resolveUserIdFromRequest(req);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '请求体必须是 JSON 对象' }, { status: 400 });
    }
    const { knowledgeNodeId } = body;

    if (!knowledgeNodeId) {
      return NextResponse.json(
        { error: '缺少必填字段: knowledgeNodeId' },
        { status: 400 },
      );
    }

    // 1. 获取知识点（含已有表征——用于缓存命中判断）
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

    // 表征缓存：已有生成结果且调用方未强制重生成时直接返回，
    // 不再重复调付费 LLM（重复点"生成表征"是高频误操作）。
    // 注意顺序：缓存判断必须在限流之前——命中缓存的请求不烧 LLM 配额。
    const force = (body as { force?: unknown }).force === true;
    if (!force && node.representationType && node.representationData) {
      return NextResponse.json({
        success: true,
        nodeId: knowledgeNodeId,
        representationType: node.representationType,
        representationData: node.representationData,
        cached: true,
      });
    }

    // 限流：检测+生成每次最多 2 次付费 LLM 调用（移自校验段，缓存命中不限）
    const rl = rateLimit(`llm:${userId}`, 60, 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'AI 调用太频繁了，请稍后再试' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      );
    }

    const subject = node.subject?.name || '';
    const nodeTitle = node.title || '';
    const nodeSummary = node.summary || '';
    const keywords = node.keywords || [];

    // 2. 检测最佳表征类型
    const repType = await detectRepresentationType(
      subject,
      nodeTitle,
      nodeSummary,
      keywords,
    );

    // 3. 生成表征内容（如果 LLM 超时或 prompt 不在 REPRESENTATION_PROMPTS
    //    中，回退到 concept_map 数据，不抛错 — 用户至少能看到一个视图）
    //    保存的类型必须是实际生效类型（generated.type）：回退时数据是
    //    concept_map 结构，配原 repType 落库就是脏数据。
    let effectiveType = repType;
    let repData: Record<string, unknown> = { concepts: [{ name: nodeTitle, description: nodeSummary }], relations: [] };
    let generationFailed = false;
    try {
      const generated = await generateRepresentationContent(
        nodeTitle,
        nodeSummary,
        subject,
        repType,
      );
      if (generated && typeof generated === 'object') {
        effectiveType = generated.type;
        repData = generated.data as Record<string, unknown>;
        generationFailed = generated.failed === true;
      }
    } catch (genErr: unknown) {
      console.error('[Representation Detect] generate failed, using concept_map fallback:', genErr);
      effectiveType = 'concept_map';
      generationFailed = true;
    }

    // 彻底失败的兜底数据（空壳 concept_map）不落库：否则会被缓存层
    // 永久返回，LLM 恢复后用户也拿不到真表征（只能等 force 重生成）
    if (generationFailed) {
      return NextResponse.json(
        { error: '表征生成失败（AI 服务暂不可用），请稍后重试' },
        { status: 502 },
      );
    }

    // 4. 保存到数据库
    await saveRepresentation(knowledgeNodeId, effectiveType, repData as Prisma.InputJsonValue);

    return NextResponse.json({
      success: true,
      nodeId: knowledgeNodeId,
      representationType: effectiveType,
      representationData: repData,
    });
  } catch (error: unknown) {
    console.error('[Representation Detect] Error:', error);
    return NextResponse.json(
      { error: `表征生成失败: ${getErrorMessage(error)}` },
      { status: getErrorStatus(error) },
    );
  }
}
