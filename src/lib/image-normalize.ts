'use client';

// iPad/iPhone 相机直出 HEIC，原图常 3-8MB。直接塞进 FormData 上传有两个坑：
//   1. WebKit 对相机直出 File 做 multipart 序列化时会抛
//      "TypeError: The string did not match the expected pattern"
//      —— 请求根本没发出，服务端零记录；
//   2. 原图可能超过服务端 5MB 上限（413）。
// 所以在客户端先用 canvas 重编码成干净的小 JPEG 再传：
// 格式统一、体积可控、文件名干净（ASCII），彻底绕开 WebKit 的序列化 bug。
// canvas 解码失败（浏览器本身不认识的格式）时返回 null，
// 调用方回退传原文件（服务端还有 sharp 转换兜底）。

const MAX_DIMENSION = 1920; // OCR/vision LLM 用 1920px 足够清晰
const JPEG_QUALITY = 0.85;

export interface NormalizedImage {
  blob: Blob;
  fileName: string;
}

async function decodeToCanvasSource(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void } | null> {
  // 优先 createImageBitmap（默认按 EXIF 方向转正，且不占主线程解码）
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // 继续走 <img> 兜底
    }
  }

  // <img> 兜底：Safari 能显示 HEIC，就能解到 canvas
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image decode failed'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      cleanup: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/**
 * 把拍照/相册图片重编码为 JPEG Blob（最长边 1920，quality 0.85）。
 * 返回 null 表示浏览器无法解码该格式（调用方应回退上传原文件）。
 */
export async function normalizeImageForUpload(file: File): Promise<NormalizedImage | null> {
  try {
    const decoded = await decodeToCanvasSource(file);
    if (!decoded) return null;

    try {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(decoded.width, decoded.height));
      const w = Math.max(1, Math.round(decoded.width * scale));
      const h = Math.max(1, Math.round(decoded.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // JPEG 无透明通道，先铺白底避免透明区域变黑
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(decoded.source, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
      );
      if (!blob) return null;
      return { blob, fileName: 'photo.jpg' };
    } finally {
      decoded.cleanup();
    }
  } catch {
    return null;
  }
}
