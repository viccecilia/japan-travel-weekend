export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_EDGE = 4096;
export const PRODUCT_IMAGE_UPLOAD_GUIDANCE = '请上传 JPG、PNG 或 WebP；单张不超过 10MB，长边建议不超过 4096px。';

const supportedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const supportedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

type ImageProcessingAdapters = {
  decode?: (file: File) => Promise<DecodedImage>;
  render?: (image: DecodedImage, width: number, height: number, quality: number) => Promise<Blob>;
};

export type PreparedProductImage = {
  file: File;
  repaired: boolean;
  note: string;
};

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const webpName = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'route-image'}.webp`;

async function decodeInBrowser(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close()};
  }
  throw new Error('当前浏览器不能读取并修复这张图片');
}

async function renderWebp(image: DecodedImage, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器不能转换图片');
  context.drawImage(image.source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp') throw new Error('当前浏览器不能生成 WebP 图片');
  return blob;
}

export async function prepareProductImageForUpload(file: File, adapters: ImageProcessingAdapters = {}): Promise<PreparedProductImage> {
  if (file.size <= 0) throw new Error(`“${file.name}”是空文件。${PRODUCT_IMAGE_UPLOAD_GUIDANCE}`);
  const mimeSupported = supportedMimeTypes.has(file.type);
  const extensionSupported = supportedExtensions.has(extensionOf(file.name));
  const canInspect = typeof createImageBitmap === 'function' || Boolean(adapters.decode);
  if (!canInspect && mimeSupported && extensionSupported && file.size <= PRODUCT_IMAGE_MAX_BYTES) {
    return {file, repaired: false, note: ''};
  }

  let decoded: DecodedImage;
  try {
    decoded = await (adapters.decode ?? decodeInBrowser)(file);
  } catch {
    throw new Error(`“${file.name}”无法读取，可能是文件损坏或浏览器不支持该格式。${PRODUCT_IMAGE_UPLOAD_GUIDANCE}`);
  }
  try {
    if (!Number.isFinite(decoded.width) || !Number.isFinite(decoded.height) || decoded.width <= 0 || decoded.height <= 0) {
      throw new Error(`“${file.name}”没有有效的图片尺寸。${PRODUCT_IMAGE_UPLOAD_GUIDANCE}`);
    }
    const oversized = decoded.width > PRODUCT_IMAGE_MAX_EDGE || decoded.height > PRODUCT_IMAGE_MAX_EDGE;
    const needsRepair = !mimeSupported || !extensionSupported || file.size > PRODUCT_IMAGE_MAX_BYTES || oversized;
    if (!needsRepair) return {file, repaired: false, note: ''};

    let scale = Math.min(1, PRODUCT_IMAGE_MAX_EDGE / decoded.width, PRODUCT_IMAGE_MAX_EDGE / decoded.height);
    const render = adapters.render ?? renderWebp;
    const qualities = [0.88, 0.76, 0.64, 0.52];
    for (let resizeAttempt = 0; resizeAttempt < 3; resizeAttempt += 1) {
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      for (const quality of qualities) {
        const blob = await render(decoded, width, height, quality);
        if (blob.size > 0 && blob.size <= PRODUCT_IMAGE_MAX_BYTES) {
          const repaired = new File([blob], webpName(file.name), {type: 'image/webp', lastModified: file.lastModified});
          return {file: repaired, repaired: true, note: `已自动转换为 WebP，并调整为 ${width}×${height}px（${(repaired.size / 1024 / 1024).toFixed(1)}MB）`};
        }
      }
      scale *= 0.75;
    }
    throw new Error(`“${file.name}”自动压缩后仍超过 10MB。${PRODUCT_IMAGE_UPLOAD_GUIDANCE}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(PRODUCT_IMAGE_UPLOAD_GUIDANCE)) throw error;
    throw new Error(`“${file.name}”无法自动转换。${PRODUCT_IMAGE_UPLOAD_GUIDANCE}`);
  } finally {
    decoded.close?.();
  }
}
