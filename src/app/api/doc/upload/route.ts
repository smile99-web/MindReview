import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

// Max .txt/.docx file size we accept (10 MB — larger is almost
// certainly a textbook, not a question).
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// 解压后文本上限：200 万字符（docx zip 高压缩比，压缩前 10MB 可能解压出数百 MB）
const MAX_CONTENT_CHARS = 2_000_000;

const ALLOWED_EXTENSIONS = new Set(['.txt', '.docx']);

// POST /api/doc/upload
// Body: multipart/form-data with field "file" (.txt or .docx)
// Returns: { id, fileName, content, charCount }
//
// Parse .txt inline; .docx is passed through mammoth (a lightweight
// docx → text converter that runs synchronously in Node, no cloud
// dependency). The raw text is stored as DocUpload.content so the
// analysis step can feed it to the existing decomposeKnowledge LLM
// helper.
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(req);
    const form = await req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { error: 'file field is required (multipart/form-data)' },
        { status: 400 },
      );
    }

    const blob = file as unknown as {
      name: string;
      size: number;
      type: string;
      arrayBuffer: () => Promise<ArrayBuffer>;
    };

    if (blob.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `文件过大（${(blob.size / 1024 / 1024).toFixed(1)} MB），上限 10 MB`,
        },
        { status: 413 },
      );
    }

    const nameLower = blob.name.toLowerCase();
    const ext = ALLOWED_EXTENSIONS.has(nameLower)
      ? nameLower
      : (nameLower.includes('.') ? nameLower.slice(nameLower.lastIndexOf('.')) : '');
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: '仅支持 .txt 和 .docx 文件格式' },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await blob.arrayBuffer());
    let content: string;

    if (ext === '.txt') {
      content = buf.toString('utf-8').trim();
    } else {
      // .docx — use mammoth (synchronous, no network)
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: buf });
      content = (result.value || '').trim();
      if (!content && result.messages.length > 0) {
        const errs = result.messages
          .map((m: { type: string; message: string }) => m.message)
          .join('; ');
        return NextResponse.json(
          { error: `无法解析该 .docx 文件: ${errs}` },
          { status: 422 },
        );
      }
    }

    if (content.length === 0) {
      return NextResponse.json(
        { error: '文件内容为空' },
        { status: 422 },
      );
    }

    // docx 是 zip 高压缩格式：10MB 压缩包可解压出数百 MB 文本，
    // 压缩前的大小检查挡不住，解压后的文本长度必须再限一次
    if (content.length > MAX_CONTENT_CHARS) {
      return NextResponse.json(
        { error: `文件文本过长（${(content.length / 10000).toFixed(0)} 万字），上限 ${MAX_CONTENT_CHARS / 10000} 万字` },
        { status: 413 },
      );
    }

    const created = await prisma.docUpload.create({
      data: {
        userId,
        fileName: blob.name,
        content,
        subjectName: null,
      },
      select: {
        id: true,
        fileName: true,
        content: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      id: created.id,
      fileName: created.fileName,
      content: created.content,
      charCount: created.content.length,
      createdAt: created.createdAt,
    });
  } catch (error: unknown) {
    console.error('[doc/upload] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
