import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveUserIdFromRequest } from '@/lib/user-context';
import { getErrorMessage } from '@/lib/errors';

// 20MB cap — textbooks are usually 5-15MB; reject larger to keep
// memory + DB bytea reasonable.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt']);

// POST /api/textbook/upload
// Body: multipart/form-data with field "file" (.pdf / .docx / .txt)
//       + optional "subjectId" so we can pre-bind the upload
//       to a Subject row (user can also pick later on the
//       decomposition step).
// Returns: { id, fileName, fileType, content, charCount }
//
// Parses the file to text. PDF goes through pdf-parse, DOCX through
// mammoth, TXT inline as utf-8. The raw text is stored on
// TextbookUpload.content so the decompose step can feed the LLM.
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
    const subjectId = (form.get('subjectId') as string | null) || null;

    const blob = file as unknown as {
      name: string;
      size: number;
      type: string;
      arrayBuffer: () => Promise<ArrayBuffer>;
    };
    if (blob.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `文件过大（${(blob.size / 1024 / 1024).toFixed(1)} MB），上限 20 MB` },
        { status: 413 },
      );
    }

    const nameLower = blob.name.toLowerCase();
    const dotIdx = nameLower.lastIndexOf('.');
    const ext = dotIdx >= 0 ? nameLower.slice(dotIdx) : '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: '仅支持 .pdf / .docx / .txt 文件格式' },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await blob.arrayBuffer());
    let content: string;
    let fileType: 'pdf' | 'docx' | 'txt';

    if (ext === '.txt') {
      content = buf.toString('utf-8').trim();
      fileType = 'txt';
    } else if (ext === '.docx') {
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
      fileType = 'docx';
    } else {
      // .pdf — pdf-parse is a synchronous parser; we dynamic-import
      // because it's a CJS module and not always needed. v2.x is
      // pure ESM (no default export) so we read the named export.
      const pdfMod = await import('pdf-parse');
      const pdfParse = (pdfMod as { default?: (data: Buffer) => Promise<{ text: string; numpages: number }>; })
        .default ?? (pdfMod as unknown as (data: Buffer) => Promise<{ text: string; numpages: number }>);
      const result = await pdfParse(buf);
      content = (result.text || '').trim();
      if (!content) {
        return NextResponse.json(
          { error: 'PDF 文件解析后内容为空（可能为扫描版 PDF / 图片 PDF）' },
          { status: 422 },
        );
      }
      fileType = 'pdf';
    }

    if (content.length === 0) {
      return NextResponse.json({ error: '文件内容为空' }, { status: 422 });
    }

    const created = await prisma.textbookUpload.create({
      data: {
        userId,
        fileName: blob.name,
        fileType,
        content,
        subjectId,
      },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        content: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      id: created.id,
      fileName: created.fileName,
      fileType: created.fileType,
      content: created.content,
      charCount: created.content.length,
      createdAt: created.createdAt,
    });
  } catch (error: unknown) {
    console.error('[textbook/upload] Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
