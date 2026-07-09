import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';
import { llmVisionCall } from '@/lib/llm-client';

// Max image size we accept (5 MB). Larger files are rejected to
// protect the DB bytea column and the vision-LLM request body.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// POST /api/exam/upload
// Body: multipart/form-data with field "image" (the question photo)
// Returns: { id, ocrText, subjectName }
//
// Step 1 of the exam-photo flow. The image is base64-encoded and
// sent to the configured vision-capable LLM (see llmVisionCall). The
// LLM is asked to (a) extract the question text verbatim and (b)
// guess the subject from the content. The raw image is stored as
// bytea in ExamUpload.imageData so the user can re-open the upload
// and see what they originally photographed.
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);

    const form = await req.formData();
    const file = form.get('image');
    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'image field is required (multipart/form-data)' },
        { status: 400 },
      );
    }

    // file is a File (or Blob) in the Web Fetch runtime
    const blob = file as unknown as { size: number; type: string; arrayBuffer: () => Promise<ArrayBuffer> };
    if (blob.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `图片过大（${(blob.size / 1024 / 1024).toFixed(1)} MB），上限 5 MB` },
        { status: 413 },
      );
    }

    const mimeType = blob.type || 'image/png';
    if (!mimeType.startsWith('image/')) {
      return NextResponse.json(
        { error: `不支持的文件类型: ${mimeType}` },
        { status: 400 },
      );
    }

    let buf = Buffer.from(await blob.arrayBuffer());
    let finalMimeType = mimeType;

    // iPad / iPhone 拍照默认是 HEIC/HEIF 格式。大多数多模态 LLM
    // (DeepSeek / MiniMax / GPT-4o 等) 只接受 PNG / JPEG / WebP /
    // GIF。HEIC 直接传会让 API 报错或返回空内容。
    //
    // 用 sharp (Next.js 内置的图片处理库) 把 HEIC 转 JPEG 再传
    // 给 vision LLM。Sharp 是 transitive 依赖 (next -> sharp)，
    // 不需要额外安装。
    if (
      mimeType === 'image/heic' ||
      mimeType === 'image/heif' ||
      mimeType === 'image/heic-sequence' ||
      mimeType === 'image/heif-sequence'
    ) {
      try {
        const sharp = (await import('sharp')).default;
        const converted = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
        buf = Buffer.from(converted);
        finalMimeType = 'image/jpeg';
      } catch (convErr: unknown) {
        console.error('[exam/upload] HEIC->JPEG conversion failed:', convErr);
        return NextResponse.json(
          { error: '图片格式转换失败（HEIC -> JPEG）。请尝试在 iPad 设置 -> 相机 -> 格式 中改为"兼容性最好"，或用截图后上传。' },
          { status: 422 },
        );
      }
    }

    const imageBase64 = buf.toString('base64');

    // Ask the vision LLM to extract the question text and guess the
    // subject. JSON mode forces structured output so the UI doesn't
    // have to parse free-form prose.
    const systemPrompt = `你是一位中学老师，擅长从图片中识别题目。`;
    const userPrompt = `请仔细查看这张图片（可能是一道题、一道题的局部、或一张试卷的一角），然后：
1. 完整提取图中所有文字（题干、选项、公式、图示说明等）。数学公式用 LaTeX，行内用 $...$，独立公式用 $$...$$。
2. 推断学科（数学/物理/化学/历史/道法/语文/地理/生物），不确定就返回 "未知"。

严格按 JSON 格式返回：
{"ocrText": "完整题目文字（保留 LaTeX）", "subjectName": "学科名"}

不要任何解释，只返回 JSON。`;

    const raw = await llmVisionCall({
      prompt: userPrompt,
      imageBase64,
      mimeType: finalMimeType,
      systemPrompt,
      temperature: 0.1,
      maxTokens: 2048,
      jsonMode: true,
    });

    // The LLM might wrap the JSON in a fence or prefix it. Strip
    // common wrappers before parsing.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    let parsed: { ocrText?: string; subjectName?: string } = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fall back to a tolerant parse: grab the first {...} block
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          // last-resort: treat the whole response as the OCR text
          parsed = { ocrText: raw.trim(), subjectName: '' };
        }
      } else {
        parsed = { ocrText: raw.trim(), subjectName: '' };
      }
    }

    const ocrText = (parsed.ocrText || '').trim();
    const subjectName = (parsed.subjectName || '').trim();
    if (!ocrText) {
      return NextResponse.json(
        { error: '未能从图片中识别到题目文字，请换张更清晰的照片重试' },
        { status: 422 },
      );
    }

    // Persist the upload. imageData is stored as bytea (Prisma Bytes
    // maps to Node Buffer). The image is kept small (<5MB enforced
    // above) so this stays well under PostgreSQL TOAST limits.
    const created = await prisma.examUpload.create({
      data: {
        userId,
        imageData: buf,
        ocrText,
        subjectName: subjectName === '未知' ? null : subjectName || null,
      },
      select: { id: true, ocrText: true, subjectName: true, createdAt: true },
    });

    return NextResponse.json({
      id: created.id,
      ocrText: created.ocrText,
      subjectName: created.subjectName,
      createdAt: created.createdAt,
    });
  } catch (error: unknown) {
    console.error('[exam/upload] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
