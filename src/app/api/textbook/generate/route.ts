import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { llmCallWithLog } from '@/lib/llm-client';
import { SUBJECT_CONFIG, SUBJECTS } from '@/types';
import type { IcapLevel, SubjectName } from '@/types';

const GRADES = new Set(['初一', '初二', '初三', '高一', '高二', '高三']);
const VOLUMES = new Set(['上册', '下册', '全册']);
const ICAP_LEVELS = new Set(['Passive', 'Active', 'Constructive', 'Interactive']);

interface GeneratedNode {
  title?: string;
  summary?: string;
  tutorial?: string;
  keywords?: unknown;
  prerequisites?: unknown;
  commonMistakes?: unknown;
  typicalQuestions?: unknown;
  difficulty?: unknown;
  cognitiveLoad?: unknown;
  icapLevel?: unknown;
}

interface GeneratedChapter {
  title?: string;
  overview?: string;
  sortOrder?: unknown;
  knowledgeNodes?: unknown;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 8);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function cleanText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sanitizeJsonString(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, (ch) => {
    if (ch === '\n') return '\\n';
    if (ch === '\r') return '\\r';
    if (ch === '\t') return '\\t';
    if (ch === '\b') return '\\b';
    if (ch === '\f') return '\\f';
    return '\\u' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4);
  });
}

function parseJsonObject(raw: string): { editionNote?: unknown; chapters?: unknown } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let source = fenced?.[1] || raw;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI返回内容不是JSON对象');
  }

  source = source.slice(start, end + 1);
  source = sanitizeJsonString(source);
  return JSON.parse(source);
}

function buildPrompt(subject: SubjectName, grade: string, volume: string) {
  const systemPrompt = `你是一位熟悉人民教育出版社教材体系的中学${subject}教研员和一线教师。

任务：根据“最新人教版/人民教育出版社”教材体系，为指定学科、年级和册别生成可导入学习系统的章节与教程内容。

要求：
- 优先依据最新人教版教材目录、课程标准和常见教学顺序；如果版本或册别存在地区差异，请在 editionNote 中说明。
- 不要复制教材原文、课文长段落或题目原文；教程内容必须是原创讲解、学习提示、例题思路和易错提醒。
- 章节标题应贴近人教版目录；每章拆成4到7个可复习知识点。
- summary 控制在60到140字；tutorial 控制在120到260字，适合作为知识卡片正文。
- difficulty 和 cognitiveLoad 为1到5；icapLevel 只能是 Passive、Active、Constructive、Interactive。
- 只输出严格JSON，不要Markdown，不要额外解释。`;

  const userPrompt = `请生成：
学科：${subject}
年级：${grade}
册别：${volume}

JSON格式：
{
  "editionNote": "教材版本或范围说明",
  "chapters": [
    {
      "title": "章节标题",
      "overview": "本章导学概览",
      "sortOrder": 1,
      "knowledgeNodes": [
        {
          "title": "知识点标题",
          "summary": "知识点摘要",
          "tutorial": "原创教程内容",
          "keywords": ["关键词"],
          "prerequisites": ["前置知识"],
          "commonMistakes": ["常见错误"],
          "typicalQuestions": ["典型题型"],
          "difficulty": 3,
          "cognitiveLoad": 3,
          "icapLevel": "Active"
        }
      ]
    }
  ]
}`;

  return { systemPrompt, userPrompt };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const subject = cleanText(body.subject) as SubjectName;
    const grade = cleanText(body.grade, '初二');
    const volume = cleanText(body.volume, '上册');

    if (!SUBJECTS.includes(subject)) {
      return NextResponse.json({ error: '请选择有效学科' }, { status: 400 });
    }

    if (!GRADES.has(grade) || !VOLUMES.has(volume)) {
      return NextResponse.json({ error: '请选择有效年级和册别' }, { status: 400 });
    }

    const { systemPrompt, userPrompt } = buildPrompt(subject, grade, volume);
    const raw = await llmCallWithLog(
      {
        generatorType: 'textbook',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        maxTokens: 12000,
        jsonMode: true,
      },
      prisma,
    );

    const generated = parseJsonObject(raw);
    const chapters = Array.isArray(generated.chapters)
      ? (generated.chapters as GeneratedChapter[]).slice(0, 14)
      : [];

    if (chapters.length === 0) {
      return NextResponse.json({ error: 'AI没有返回可导入的章节' }, { status: 500 });
    }

    const config = SUBJECT_CONFIG[subject];
    const subjectRecord = await prisma.subject.upsert({
      where: { name: subject },
      update: {
        icon: config.icon,
        colorClass: config.colorClass,
        description: `${grade}${volume} 人教版教材内容`,
      },
      create: {
        name: subject,
        icon: config.icon,
        colorClass: config.colorClass,
        description: `${grade}${volume} 人教版教材内容`,
      },
    });

    let chapterCount = 0;
    let nodeCount = 0;
    let cardCount = 0;

    for (const [chapterIndex, chapterItem] of chapters.entries()) {
      const title = cleanText(chapterItem.title);
      if (!title) continue;

      const sortOrder = clampNumber(chapterItem.sortOrder, chapterIndex + 1, 1, 99);
      const existingChapter = await prisma.chapter.findFirst({
        where: { subjectId: subjectRecord.id, parentId: null, title },
      });
      const chapter = existingChapter
        ? await prisma.chapter.update({
            where: { id: existingChapter.id },
            data: { sortOrder },
          })
        : await prisma.chapter.create({
            data: {
              subjectId: subjectRecord.id,
              title,
              sortOrder,
            },
          });

      chapterCount += 1;

      const nodes = Array.isArray(chapterItem.knowledgeNodes)
        ? (chapterItem.knowledgeNodes as GeneratedNode[]).slice(0, 8)
        : [];

      if (nodes.length === 0 && cleanText(chapterItem.overview)) {
        nodes.push({
          title: `${title}导学`,
          summary: cleanText(chapterItem.overview),
          tutorial: cleanText(chapterItem.overview),
          icapLevel: 'Passive',
        });
      }

      for (const nodeItem of nodes) {
        const nodeTitle = cleanText(nodeItem.title);
        if (!nodeTitle) continue;

        const icapLevel = ICAP_LEVELS.has(String(nodeItem.icapLevel))
          ? String(nodeItem.icapLevel)
          : 'Active';
        const summary = cleanText(nodeItem.summary, cleanText(chapterItem.overview));
        const tutorial = cleanText(nodeItem.tutorial, summary);
        const existingNode = await prisma.knowledgeNode.findFirst({
          where: {
            subjectId: subjectRecord.id,
            chapterId: chapter.id,
            title: nodeTitle,
          },
        });
        const nodeData = {
          subjectId: subjectRecord.id,
          chapterId: chapter.id,
          title: nodeTitle,
          summary,
          keywords: asStringArray(nodeItem.keywords),
          prerequisites: asStringArray(nodeItem.prerequisites),
          commonMistakes: asStringArray(nodeItem.commonMistakes),
          typicalQuestions: asStringArray(nodeItem.typicalQuestions),
          difficulty: clampNumber(nodeItem.difficulty, 3, 1, 5),
          cognitiveLoad: clampNumber(nodeItem.cognitiveLoad, 3, 1, 5),
          icapLevel: icapLevel as IcapLevel,
        };
        const node = existingNode
          ? await prisma.knowledgeNode.update({
              where: { id: existingNode.id },
              data: nodeData,
            })
          : await prisma.knowledgeNode.create({
              data: {
                ...nodeData,
                masteryLevel: 0,
              },
            });

        nodeCount += 1;

        const cardTitle = `${nodeTitle}教程`;
        const existingCard = await prisma.knowledgeCard.findFirst({
          where: { knowledgeNodeId: node.id, cardType: 'summary' },
        });

        if (existingCard) {
          await prisma.knowledgeCard.update({
            where: { id: existingCard.id },
            data: { title: cardTitle, content: tutorial, sortOrder: 0 },
          });
        } else {
          await prisma.knowledgeCard.create({
            data: {
              knowledgeNodeId: node.id,
              cardType: 'summary',
              title: cardTitle,
              content: tutorial,
              sortOrder: 0,
            },
          });
        }
        cardCount += 1;
      }
    }

    return NextResponse.json({
      success: true,
      subject: subjectRecord,
      editionNote: cleanText(generated.editionNote),
      counts: { chapters: chapterCount, knowledgeNodes: nodeCount, cards: cardCount },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '教材生成失败';
    console.error('[Textbook Generate] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
