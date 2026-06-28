import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { llmCallWithLog } from '@/lib/llm-client';
import { sanitizeJsonString } from '@/lib/utils';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { SUBJECT_CONFIG, SUBJECTS } from '@/types';
import type { IcapLevel, SubjectName } from '@/types';

const GRADES = new Set(['初一', '初二', '初三', '高一', '高二', '高三']);
const VOLUMES = new Set(['上册', '下册', '全册']);
const ICAP_LEVELS = new Set(['Passive', 'Active', 'Constructive', 'Interactive']);

// 跨年级禁词表：key=当前用户选定的 grade+volume，value=若章节命中这些词就拒绝
// 用来阻止 AI 把别的年级/册别的核心概念混到当前生成里（例如初二全册出现"一元二次方程"）
const FORBIDDEN_KEYWORDS_BY_GRADE_VOLUME: Record<string, string[]> = {
  '初一上册': ['一元二次方程', '二次函数', '反比例函数', '相似', '锐角三角函数', '圆', '投影', '视图'],
  '初一下册': ['一元二次方程', '二次函数', '相似', '锐角三角函数', '圆', '投影', '视图', '全等三角形', '轴对称', '分式', '二次根式', '勾股定理', '平行四边形', '一次函数', '数据分析'],
  '初二上册': ['一元二次方程', '二次函数', '反比例函数', '相似', '锐角三角函数', '圆', '投影', '视图'],
  '初二下册': ['一元二次方程', '二次函数', '反比例函数', '相似', '锐角三角函数', '圆', '投影'],
  '初三上册': ['相交线与平行线', '实数', '二元一次方程组', '不等式', '整式', '三角形全等', '轴对称', '分式', '二次根式', '勾股定理'],
  '初三十册': ['相交线与平行线', '实数', '二元一次方程组', '不等式', '整式', '三角形全等', '轴对称', '分式', '二次根式', '勾股定理'],
  '初三下册': ['一元二次方程', '二次函数', '旋转', '圆', '概率初步'],
  '初三十一册': ['一元二次方程', '二次函数', '旋转', '圆', '概率初步'],
  '初一全册': ['一元二次方程', '二次函数', '反比例函数', '相似', '锐角三角函数', '圆', '投影', '视图', '全等三角形', '轴对称', '分式', '二次根式', '勾股定理', '平行四边形', '一次函数', '数据分析'],
  '初二全册': ['一元二次方程', '二次函数', '反比例函数', '相似', '锐角三角函数', '圆', '投影', '视图'],
  '初三全册': ['相交线与平行线', '实数', '二元一次方程组', '不等式', '整式', '三角形全等', '轴对称', '分式', '二次根式', '勾股定理'],
  '高一下册': ['一元二次方程'],
  '高二下册': ['一元二次方程'],
  '高三十册': ['一元二次方程'],
  '高三十一册': ['一元二次方程'],
};

function getForbiddenKeywords(grade: string, volume: string): string[] {
  // 规范化 volume 表达，避免脚本写"十册"导致命中失败
  const normVolume = volume === '上册' ? '上册' : volume === '下册' ? '下册' : '全册';
  return FORBIDDEN_KEYWORDS_BY_GRADE_VOLUME[`${grade}${normVolume}`] || [];
}

function chapterContainsForbiddenKeyword(
  title: string,
  overview: string,
  forbidden: string[],
): string | null {
  if (forbidden.length === 0) return null;
  const haystack = `${title}\n${overview}`;
  for (const keyword of forbidden) {
    if (haystack.includes(keyword)) {
      return keyword;
    }
  }
  return null;
}

// 年级章节约束：保证 AI 只生成指定年级的章节
const GRADE_CHAPTER_RANGES: Record<string, Record<string, string>> = {
  "初一": {
    "数学": "七上第1-4章（有理数/整式的加减/一元一次方程/几何图形初步）、七下第5-10章（相交线与平行线/实数/平面直角坐标系/二元一次方程组/不等式与不等式组/数据的收集整理与描述）",
    "物理": "",
    "化学": "",
    "历史": "",
    "道法": "",
  },
  "初二": {
    "数学": "八上第11-15章（三角形/全等三角形/轴对称/整式的乘法与因式分解/分式）、八下第16-20章（二次根式/勾股定理/平行四边形/一次函数/数据的分析）",
    "物理": "",
    "化学": "",
    "历史": "",
    "道法": "",
  },
  "初三": {
    "数学": "九上第21-25章（一元二次方程/二次函数/旋转/圆/概率初步）、九下第26-29章（反比例函数/相似/锐角三角函数/投影与视图）",
    "物理": "",
    "化学": "",
    "历史": "",
    "道法": "",
  },
  "高一": { "数学": "", "物理": "", "化学": "", "历史": "", "道法": "" },
  "高二": { "数学": "", "物理": "", "化学": "", "历史": "", "道法": "" },
  "高三": { "数学": "", "物理": "", "化学": "", "历史": "", "道法": "" },
};

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

interface ChapterOutline {
  title: string;
  overview: string;
  sortOrder: number;
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

function parseJsonObject(raw: string): Record<string, unknown> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let source = fenced?.[1] || raw;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    const preview = raw.slice(0, 200).replace(/\n/g, ' ');
    throw new Error(
      `AI返回内容不是JSON对象 (preview: "${preview}...") — 请检查 DEEPSEEK_API_KEY 是否有效或网络可达`,
    );
  }

  source = source.slice(start, end + 1);
  source = sanitizeJsonString(source);
  try {
    return JSON.parse(source);
  } catch (err: unknown) {
    const preview = source.slice(0, 200);
    throw new Error(
      `AI返回内容JSON解析失败 (preview: "${preview}..."): ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
}

function buildOutlinePrompt(subject: SubjectName, grade: string, volume: string) {
  // 年级章节目录约束，防止 AI 跨年级生成
  const gradeConstraint = GRADE_CHAPTER_RANGES[grade]?.[subject]
    ? `【重要】${grade}${subject}人教版只包含以下章节：${GRADE_CHAPTER_RANGES[grade][subject]}。严禁生成上述范围之外的章节。`
    : '';

  const systemPrompt = `你是一位熟悉人民教育出版社教材体系的中学${subject}教研员和一线教师。

任务：根据"最新人教版/人民教育出版社"教材体系，为指定学科、年级和册别生成章节目录大纲。

要求：
- ${gradeConstraint}
- 优先依据最新人教版教材目录、课程标准和常见教学顺序；如果版本或册别存在地区差异，请在 editionNote 中说明。
- 只生成章节目录，不要生成知识点。
- 上册/下册建议 5 到 8 章；全册建议 8 到 12 章。
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
      "sortOrder": 1
    }
  ]
}`;

  return { systemPrompt, userPrompt };
}

function buildChapterPrompt(subject: SubjectName, grade: string, volume: string, chapter: ChapterOutline) {
  const systemPrompt = `你是一位中学${subject}教师。请只为一个指定章节生成可导入学习系统的知识点。

要求：
- 不要复制教材原文、课文长段落或题目原文；教程内容必须是原创讲解、学习提示、例题思路和易错提醒。
- 只生成本章 3 到 5 个核心可复习知识点，避免过细。
- summary 控制在40到90字；tutorial 控制在80到160字，适合作为知识卡片正文。
- difficulty 和 cognitiveLoad 为1到5；icapLevel 只能是 Passive、Active、Constructive、Interactive。
- 只输出严格JSON，不要Markdown，不要额外解释。`;

  const userPrompt = `请生成：
学科：${subject}
年级：${grade}
册别：${volume}
章节：${chapter.title}
章节概览：${chapter.overview}

JSON格式：
{
  "title": "${chapter.title}",
  "overview": "${chapter.overview}",
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
}`;

  return { systemPrompt, userPrompt };
}

async function generateChapterOutlines(subject: SubjectName, grade: string, volume: string) {
  const { systemPrompt, userPrompt } = buildOutlinePrompt(subject, grade, volume);
  const raw = await llmCallWithLog(
    {
      generatorType: 'textbook_outline',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 1600,
      jsonMode: true,
    },
    prisma,
  );

  if (!raw || !raw.trim()) {
    throw new Error('AI 返回内容为空 — 请检查 API Key 和网络');
  }

  const generated = parseJsonObject(raw);
  const maxChapters = volume === '全册' ? 12 : 8;
  const chapters = Array.isArray(generated.chapters)
    ? (generated.chapters as GeneratedChapter[]).slice(0, maxChapters)
    : [];
  const outlines = chapters
    .map((chapter, index): ChapterOutline | null => {
      const title = cleanText(chapter.title);
      if (!title) return null;
      return {
        title,
        overview: cleanText(chapter.overview, `${title}导学概览`),
        sortOrder: clampNumber(chapter.sortOrder, index + 1, 1, 99),
      };
    })
    .filter((chapter): chapter is ChapterOutline => Boolean(chapter));

  return {
    editionNote: cleanText(generated.editionNote),
    chapters: outlines,
  };
}

async function generateChapterKnowledge(
  subject: SubjectName,
  grade: string,
  volume: string,
  chapter: ChapterOutline,
): Promise<GeneratedChapter> {
  const { systemPrompt, userPrompt } = buildChapterPrompt(subject, grade, volume, chapter);
  const raw = await llmCallWithLog(
    {
      generatorType: 'textbook_chapter',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.25,
      maxTokens: 2200,
      jsonMode: true,
    },
    prisma,
  );

  const generated = parseJsonObject(raw);
  return {
    title: chapter.title,
    overview: cleanText(generated.overview, chapter.overview),
    sortOrder: chapter.sortOrder,
    knowledgeNodes: Array.isArray(generated.knowledgeNodes)
      ? (generated.knowledgeNodes as GeneratedNode[]).slice(0, 5)
      : [],
  };
}

export async function POST(req: NextRequest) {
  try {
    // Require auth — this route generates an entire textbook (multiple
    // deepseek LLM calls in parallel). Without this guard, any caller
    // that slipped past the proxy could burn API quota.
    await resolveUserIdFromRequest(req);

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

    // 用户可以在 /textbook/chapter-list 端点拉取 AI 给的"最新人教版"
    // 候选单元列表后，手动覆盖单元名（解决 LLM 训练数据滞后 /
    // 地区版差异问题）。如果客户端传入了 chapters，跳过 LLM 自动出
    // 大纲步骤，直接用用户确认的单元名生成知识点。
    let generated: Awaited<ReturnType<typeof generateChapterOutlines>>;
    const userChapters = Array.isArray(body.chapters) ? body.chapters : null;
    if (userChapters && userChapters.length > 0) {
      // 客户端传了 {title, overview}[] — 直接用，不调 LLM 出大纲
      const cleaned = userChapters
        .map((c: unknown, i: number) => {
          if (!c || typeof c !== 'object') return null;
          const obj = c as Record<string, unknown>;
          const title = cleanText(obj.title);
          if (!title) return null;
          return {
            title,
            overview: cleanText(obj.overview, `${title}导学概览`),
            sortOrder: i + 1,
          };
        })
        .filter((c: ChapterOutline | null): c is ChapterOutline => Boolean(c));
      if (cleaned.length === 0) {
        return NextResponse.json(
          { error: 'chapters 列表中至少需要一个有效的 title' },
          { status: 400 },
        );
      }
      generated = {
        editionNote: '（使用用户手动确认的单元列表）',
        chapters: cleaned,
      };
    } else {
      // 旧流程：让 LLM 直接出大纲
      generated = await generateChapterOutlines(subject, grade, volume);
    }
    const failedChapters: string[] = [];

    // 并行生成每章知识点（之前是串行 for-of，4 章 × 30s = 120s+ 触发 Nginx 504）
    const chapterResults = await Promise.allSettled(
      generated.chapters.map((chapter) =>
        generateChapterKnowledge(subject, grade, volume, chapter),
      ),
    );

    const chapters: GeneratedChapter[] = chapterResults.map((result, idx) => {
      const chapter = generated.chapters[idx];
      if (result.status === 'fulfilled') {
        return result.value;
      }
      console.warn('[Textbook Generate] Chapter generation failed:', chapter.title, result.reason);
      failedChapters.push(chapter.title);
      return {
        title: chapter.title,
        overview: chapter.overview,
        sortOrder: chapter.sortOrder,
        knowledgeNodes: [],
      };
    });

    if (chapters.length === 0) {
      return NextResponse.json(
        {
          error: 'AI没有返回可导入的章节',
          hint: '请先在 设置 → AI Key 中配置 DEEPSEEK_API_KEY',
          failedChapters,
        },
        { status: 500 },
      );
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
    let edgeCount = 0;

    for (const [chapterIndex, chapterItem] of chapters.entries()) {
      const title = cleanText(chapterItem.title);
      if (!title) continue;

      const forbidden = getForbiddenKeywords(grade, volume);
      const hitKeyword = chapterContainsForbiddenKeyword(title, cleanText(chapterItem.overview), forbidden);
      if (hitKeyword) {
        const reason = `章节"${title}"命中 ${grade}${volume} 禁词"${hitKeyword}"，疑似跨年级内容，已跳过`;
        console.warn('[Textbook Generate]', reason);
        failedChapters.push(reason);
        continue;
      }

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

      const chapterNodes: { id: string; title: string }[] = [];

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
        chapterNodes.push({ id: node.id, title: node.title });

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

      for (let index = 0; index < chapterNodes.length - 1; index += 1) {
        const fromNode = chapterNodes[index];
        const toNode = chapterNodes[index + 1];
        const existingEdge = await prisma.knowledgeEdge.findFirst({
          where: {
            fromId: fromNode.id,
            toId: toNode.id,
            relationType: 'prerequisite',
          },
        });

        if (!existingEdge) {
          await prisma.knowledgeEdge.create({
            data: {
              fromId: fromNode.id,
              toId: toNode.id,
              relationType: 'prerequisite',
              label: `${fromNode.title} → ${toNode.title}`,
            },
          });
          edgeCount += 1;
        }
      }
    }

    return NextResponse.json({
      success: true,
      subject: subjectRecord,
      editionNote: cleanText(generated.editionNote),
      counts: { chapters: chapterCount, knowledgeNodes: nodeCount, cards: cardCount, edges: edgeCount },
      failedChapters,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '教材生成失败';
    console.error('[Textbook Generate] Error:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
