import { NextRequest, NextResponse } from 'next/server';
import { PDFParse } from 'pdf-parse';
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
    // 客户端传入的 subjectId 必须真实存在，否则写入时触发 FK 异常（500）
    if (subjectId) {
      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true },
      });
      if (!subject) {
        return NextResponse.json({ error: '所选学科不存在' }, { status: 400 });
      }
    }

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

    // 魔数校验：仅看扩展名时，任意文件改名 .pdf 就会进入 pdf-parse，
    // 畸形文件在 2GB 内存的 VPS 上消耗解析 CPU/内存（已知放大风险），
    // 且解析抛错被归类成 500 干扰监控。魔数不符直接 415。
    const startsWith = (ascii: string) =>
      buf.length >= ascii.length && buf.subarray(0, ascii.length).toString('latin1') === ascii;
    if (ext === '.pdf' && !startsWith('%PDF-')) {
      return NextResponse.json(
        { error: '文件内容不是有效的 PDF（扩展名与实际内容不符）' },
        { status: 415 },
      );
    }
    if (ext === '.docx' && !(buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
      return NextResponse.json(
        { error: '文件内容不是有效的 DOCX（扩展名与实际内容不符）' },
        { status: 415 },
      );
    }

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
      // .pdf — pdf-parse v2.x 是纯 ESM 且没有可调用的默认导出，
      // 正确用法是 new PDFParse({data}) + getText()（已实测 v2.4.5）。
      // 旧代码把模块对象当函数调用，所有 PDF 上传都会 500。
      const parser = new PDFParse({ data: buf });
      try {
        const result = await parser.getText();
        content = (result.text || '').trim();
      } catch (parseErr: unknown) {
        // 解析失败是客户端文件问题（4xx），不是服务器故障（500）
        return NextResponse.json(
          { error: `PDF 解析失败：${getErrorMessage(parseErr)}` },
          { status: 422 },
        );
      } finally {
        await parser.destroy().catch(() => {});
      }
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
      // 不回传整本教材全文（20MB PDF 提取文本可达数 MB，纯带宽浪费；
      // 前端只需要 id 跳转，全文由 /api/textbook/[id] 提供）
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
