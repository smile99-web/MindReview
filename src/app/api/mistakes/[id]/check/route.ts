import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { llmCall } from '@/lib/llm-client';

interface MistakeOption {
  label: string;
  text: string;
}

interface ParsedQuestion {
  stem: string;
  options: MistakeOption[];
  correctAnswer: string; // extracted from Mistake.correctAnswer
  correctAnswerText?: string; // 当 correctAnswer 是 label (A/B/C/...) 时,找对应 text
}

// POST /api/mistakes/[id]/check
// Body: { userAnswer: string }
// Returns: { isCorrect, correctAnswer, explanation, userAnswer, aiExplanation? }
//
// 把 /mistakes/[id]/review 重做页面的"用户答题 + 立即判分 + 讲解"
// 逻辑放在服务端做,原因:
// 1. 错题卡是 formatFullQuestion 拼接格式 ("stem\nA. text\nB. text..."),
//    服务端解析后给前端结构化数据,前端就能直接渲染 radio。
// 2. 判分需要对比 correctAnswer 和 userAnswer,correctAnswer 可能是
//    "C" 这种 label,也可能直接是 "0.5" 这种值 — 服务端做映射最稳。
// 3. 用户答错时,服务端调 LLM 出一道针对错题 + 答案的讲解,前端无需
//    自己处理 LLM 流(之前的 LLM 讲解 schema 是给分析用的,不适合
//    "你刚才选错了 — 错误点 + 应该怎么选" 这种即时反馈)。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      userAnswer?: unknown;
    };
    const userAnswer = typeof body.userAnswer === 'string' ? body.userAnswer : '';
    if (!userAnswer.trim()) {
      return NextResponse.json(
        { error: 'userAnswer 不能为空' },
        { status: 400 },
      );
    }

    const mistake = await prisma.mistake.findUnique({
      where: { id },
      select: {
        userId: true,
        questionText: true,
        correctAnswer: true,
        mistakeType: true,
        subject: { select: { name: true } },
      },
    });
    if (!mistake) {
      return NextResponse.json({ error: '错题不存在' }, { status: 404 });
    }
    if (mistake.userId !== userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    // Parse the formatFullQuestion string: first line is stem, the
    // rest are "A. text" / "B. text" entries. If parsing fails
    // (no "A." markers), we treat the whole text as a free-form
    // question.
    const parsed = parseQuestion(mistake.questionText, mistake.correctAnswer);

    // Determine isCorrect.
    //
    // Case 1: correctAnswer matches an option label (e.g. "C")
    //   → correct if userAnswer equals that label.
    // Case 2: correctAnswer matches an option's text exactly
    //   → correct if userAnswer matches the same option's text
    //     (so we don't expose which option is right in the answer
    //     field if the stored answer is the option's value).
    // Case 3: free-form (no options / answer is a value)
    //   → case-insensitive trimmed equality check.
    let isCorrect = false;
    let matchExplanation = '';
    if (parsed.options.length > 0) {
      // 库存答案可能是 "C" 也可能是 "C. 土地公有制"（practice 路由
      // extractChoiceLabel 同款容错）：双方都提得出选项字母时按字母比对。
      // 否则前端 radio 只回传 "C"，Case2 文本比对永远判错。
      const extractChoiceLabel = (raw: string): string | null => {
        const m = raw.trim().match(/^([A-Za-z])(?:[.、．:：]|\s|$)/);
        return m ? m[1].toLowerCase() : null;
      };
      const correctLabel = extractChoiceLabel(parsed.correctAnswer);
      const userLabel = extractChoiceLabel(userAnswer);

      if (correctLabel && userLabel) {
        const correctOpt = parsed.options.find((o) => o.label.trim().toLowerCase() === correctLabel);
        const userOpt = parsed.options.find((o) => o.label.trim().toLowerCase() === userLabel);
        isCorrect = correctLabel === userLabel;
        if (isCorrect) {
          matchExplanation = `你选择了 ${userLabel.toUpperCase()}${userOpt ? ` (${userOpt.text})` : ''}，与正确答案一致。`;
        } else {
          matchExplanation = `你选择了 ${userLabel.toUpperCase()}${userOpt ? ` (${userOpt.text})` : ''}；正确答案是 ${correctLabel.toUpperCase()}${correctOpt ? ` (${correctOpt.text})` : ''}。`;
        }
      } else {
        const correctOpt = parsed.options.find(
          (o) => o.label === parsed.correctAnswer.trim(),
        );
        if (correctOpt) {
          // Label match.
          const userOpt = parsed.options.find((o) => o.label === userAnswer.trim());
          isCorrect = !!userOpt && userOpt.label === correctOpt.label;
          if (isCorrect) matchExplanation = `你选择了 ${userOpt!.label} (${userOpt!.text})，与正确答案 ${correctOpt.label} (${correctOpt.text}) 一致。`;
          else matchExplanation = `你选择了 ${userOpt?.label || userAnswer} ${userOpt ? `(${userOpt.text})` : ''}；正确答案是 ${correctOpt.label} (${correctOpt.text})。`;
        } else {
          // correctAnswer is the option text — match by text
          // (case-insensitive trimmed).
          const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
          isCorrect = norm(parsed.correctAnswer) === norm(userAnswer);
          if (isCorrect) matchExplanation = '你的答案与正确答案一致。';
          else matchExplanation = `你选择了 "${userAnswer}"，正确答案是 "${parsed.correctAnswer}"。`;
        }
      }
    } else {
      // Free-form. Trim + case-insensitive match. Accept close
      // matches (>= 80% char overlap) as "partial".
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
      isCorrect = norm(parsed.correctAnswer) === norm(userAnswer);
      if (isCorrect) matchExplanation = '你的答案与正确答案一致。';
      else {
        // Looser match: at least 80% of correct chars appear in
        // user answer. Avoids "0.5" vs "0.50" being marked wrong.
        const correctChars = new Set(parsed.correctAnswer.replace(/\s+/g, ''));
        const userChars = new Set(userAnswer.replace(/\s+/g, ''));
        const overlap = [...correctChars].filter((c) => userChars.has(c)).length;
        const partial = correctChars.size > 0 && overlap / correctChars.size >= 0.8;
        if (partial) {
          isCorrect = true;
          matchExplanation = '你的答案与正确答案基本一致（细微差异已忽略）。';
        } else {
          matchExplanation = `你的答案与正确答案有差异。`;
        }
      }
    }

    // AI explanation — only when wrong (no point asking the LLM
    // to congratulate the user for getting it right). The prompt
    // is focused: "tell me why the wrong choice is wrong AND why
    // the right choice is right", 80-150 chars.
    let aiExplanation: string | null = null;
    if (!isCorrect) {
      try {
        const subjectName = mistake.subject?.name || '通用';
        const sysPrompt = `你是一位耐心的${subjectName}老师，正在为答错的学生讲解错题。
要求：
- 简洁：80-150 字
- 结构：先指出学生选错的具体原因，再解释正确答案为什么对
- 语气鼓励，不要说"你真笨"之类的话
- 如果题目含 LaTeX 公式，公式用 $...$ 包裹
- 只输出讲解正文，不输出标题或前缀`;
        const userPrompt = `题目：${parsed.stem}

${parsed.options.length > 0
  ? '选项：\n' + parsed.options.map((o) => `${o.label}. ${o.text}`).join('\n')
  : '（本题是填空/简答题）'}

学生的答案：${userAnswer}
正确答案：${parsed.correctAnswer}${parsed.correctAnswerText ? ` (${parsed.correctAnswerText})` : ''}
原 AI 错因分析（供参考）：${mistake.mistakeType ? mistakeTypeLabel(mistake.mistakeType) : '未知'}`;
        aiExplanation = await llmCall({
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
          maxTokens: 512,
        });
        aiExplanation = aiExplanation.trim() || null;
      } catch (err: unknown) {
        // LLM failure is non-fatal — the user still sees the
        // right/wrong verdict + matched-explanation.
        console.warn('[mistakes/check] LLM explanation failed:', getErrorMessage(err));
      }
    }

    return NextResponse.json({
      isCorrect,
      userAnswer,
      correctAnswer: parsed.correctAnswer,
      correctAnswerText: parsed.correctAnswerText ?? null,
      matchExplanation,
      aiExplanation,
      questionType: parsed.options.length > 0 ? 'multiple_choice' : 'free_form',
      options: parsed.options,
      stem: parsed.stem,
    });
  } catch (error: unknown) {
    console.error('[mistakes/check] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

function parseQuestion(questionText: string, correctAnswer: string): ParsedQuestion {
  // Split on newlines, first non-empty line is stem, the rest
  // matching /^[A-D]\.\s+/ are options.
  const lines = questionText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { stem: questionText, options: [], correctAnswer };
  }

  const stem = lines[0];
  const options: MistakeOption[] = [];
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Z])\.\s*(.*)$/);
    if (m) {
      options.push({ label: m[1], text: m[2] });
    }
  }

  // If correctAnswer is one of the option labels, also expose
  // the full option text so the UI can show it inline.
  let correctAnswerText: string | undefined;
  const opt = options.find((o) => o.label === correctAnswer.trim());
  if (opt) correctAnswerText = opt.text;

  return { stem, options, correctAnswer, correctAnswerText };
}

function mistakeTypeLabel(t: string): string {
  switch (t) {
    case 'conceptual': return '概念理解错误';
    case 'calculation': return '计算错误';
    case 'careless': return '粗心';
    case 'application': return '应用错误';
    default: return t;
  }
}
