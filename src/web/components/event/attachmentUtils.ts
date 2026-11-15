// 道次表附件（舊版 handleAttachmentUpload）：圖片在 canvas 上縮小並轉成 JPEG，PDF 直接轉成 data URL
import type { Attachment } from '@shared/types';

/** 圖片長邊上限（與舊版相同） */
export const IMAGE_MAX_DIM = 1280;
/** JPEG 品質（與舊版相同） */
export const JPEG_QUALITY = 0.78;
/** PDF 大小上限（與舊版相同） */
export const PDF_MAX_BYTES = 1.8 * 1024 * 1024;

/** 等比例縮小到長邊不超過 maxDim（不放大） */
export function fitWithin(width: number, height: number, maxDim = IMAGE_MAX_DIM): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) return { width, height };
  if (width > height) return { width: maxDim, height: Math.round((height * maxDim) / width) };
  return { width: Math.round((width * maxDim) / height), height: maxDim };
}

export type FileKind = 'image' | 'pdf' | null;

/** 判斷檔案類型（有些手機的 PDF 沒有 MIME type，改看副檔名） */
export function fileKind(file: { type: string; name: string }): FileKind {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (file.type.startsWith('image/')) return 'image';
  return null;
}

/** 相機拍照的檔名常是「image.jpg」，補上時間讓清單好辨認 */
export function attachmentName(name: string, now = new Date()): string {
  if (name && !/^image\.(jpe?g|png|heic)$/i.test(name)) return name;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `拍照 ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.jpg`;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('讀取失敗'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('無法讀取圖片'));
    img.src = src;
  });
}

/** 壓縮圖片：長邊 1280px、JPEG 0.78 */
async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('瀏覽器不支援圖片壓縮');
    // JPEG 沒有透明：先鋪白底，避免 PNG 透明處變黑
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type ReadResult = { ok: true; attachment: Attachment } | { ok: false; error: string };

/** 讀取一個檔案成附件；不支援或過大時回傳錯誤訊息 */
export async function fileToAttachment(file: File): Promise<ReadResult> {
  const kind = fileKind(file);
  try {
    if (kind === 'pdf') {
      if (file.size > PDF_MAX_BYTES) {
        return { ok: false, error: `PDF 檔案超過 1.8MB，建議轉為圖片或壓縮後上傳：${file.name}` };
      }
      return { ok: true, attachment: { name: file.name, type: 'pdf', dataUrl: await readAsDataUrl(file) } };
    }
    if (kind === 'image') {
      return { ok: true, attachment: { name: attachmentName(file.name), type: 'image', dataUrl: await compressImage(file) } };
    }
    return { ok: false, error: `不支援的檔案類型（只接受圖片或 PDF）：${file.name}` };
  } catch {
    return { ok: false, error: `無法讀取檔案：${file.name}` };
  }
}
