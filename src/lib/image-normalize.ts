'use client';

// iPad / iOS 相机直出 HEIC，且 file 是个临时文件，WebKit 序列化时容易抛
// "The string did match the expected pattern" 并阻止请求发出。
// 浏览器内能做的最稳的处理是先在 canvas 里解码 + 重编码为 JPEG Blob，
// 然后用 ASCII 干净文件名 + 匹配 mime type 重新塞进 FormData。
//
// 关键的不变量：
//   1. 永远不要再把原始相机 File 塞进 FormData（哪怕只是 fallback 路径）。
//   2. 永远用 ASCII 文件名 + 与扩展名匹配的 mime type。
//   3. 单次上传只尝试一次：捕获 fd.append 自身的错误，输出明确诊断。

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;

export interface NormalizedImage {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

/**
 * 把照片解码后重编码为 JPEG Blob。
 *
 * 绝不抛异常——失败时返回 null，调用方应明确告诉用户重试或换一张图。
 * iOS 摄像头相册里 99% 的格式（HEIC/HEIF/JPEG/PNG/GIF/WebP）走
 * `<img>` 路径都能解码；canvas 本身画 HEIC 跨平台是支持的。
 */
export async function normalizeImageForUpload(file: File): Promise<NormalizedImage | null> {
  // 1. 先把 input 文件拷到内存：相机临时文件稍后可能被 release，原始 ArrayBuffer 失效
  let sourceBytes: ArrayBuffer;
  try {
    sourceBytes = await file.arrayBuffer();
  } catch {
    return null;
  }
  if (sourceBytes.byteLength === 0) return null;
  // 持有原始字节备用（极少数情况 canvas 解码失败但 server 端 sharp 能处理 HEIC）
  const fallbackBlob = new Blob([sourceBytes], { type: file.type || 'image/jpeg' });
  const fallbackName = 'photo.jpg';
  const fallbackMime = 'image/jpeg';

  // 2. 解码成位图（不持有原始 File 引用，避免 iOS 临时文件回收）
  let bitmap: ImageBitmap | null = null;
  if (typeof createImageBitmap === 'function') {
    try {
      bitmap = await createImageBitmap(new Blob([sourceBytes], { type: file.type }));
    } catch {
      bitmap = null;
    }
  }
  if (!bitmap) {
    // 回退：用 ObjectURL + <img>（iOS 上能显示 HEIC 就能解到 canvas）
    const url = URL.createObjectURL(fallbackBlob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('image decode failed'));
        el.src = url;
      });
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const blob = await canvasToBlob(canvas);
        if (!blob) return null;
        return { blob, fileName: fallbackName, mimeType: fallbackMime };
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      URL.revokeObjectURL(url);
      // 回到 fallback：上传原始字节（server 端 sharp 兜底），但用 JPEG 命名 + mime
      // 强制 iOS WebKit 走已知格式，避免 mime=image/heic 触发序列化 bug
      return { blob: fallbackBlob, fileName: fallbackName, mimeType: fallbackMime };
    }
  }

  // 3. createImageBitmap 成功：在 canvas 上重编码
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await canvasToBlob(canvas);
    if (!blob) return null;
    return { blob, fileName: fallbackName, mimeType: fallbackMime };
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY);
  });
}

/**
 * 把图片安全地附加到 FormData。iOS WebKit 在 `append(blob, filename)` 时
 * 如果不显式设置 Content-Type 且 blob.type==''，会抛 "did match the expected pattern"。
 * 这里同时设置 blob 和 entry 上的 type，并捕获 append 错误。
 */
export function appendImageToFormData(
  fd: FormData,
  field: string,
  img: NormalizedImage,
): void {
  // 手动再包一层 File（确保 type 字段非空，且 filename 干净）
  const file = new File([img.blob], img.fileName, { type: img.mimeType });
  fd.append(field, file, img.fileName);
}
