import {describe, expect, it, vi} from 'vitest';
import {prepareProductImageForUpload, PRODUCT_IMAGE_MAX_BYTES} from '../src/app/operations/productImageUpload';

const decoded = (width = 8000, height = 4000) => ({source: {} as CanvasImageSource, width, height, close: vi.fn()});

describe('产品图片上传前修复', () => {
  it('可读取的超大或非标准图片会缩放并转换为 WebP', async () => {
    const image = decoded();
    const render = vi.fn(async (_source, width: number, height: number) => new Blob(['webp'], {type: 'image/webp'}));
    const input = new File(['bitmap'], '港口照片.bmp', {type: 'image/bmp', lastModified: 10});
    const result = await prepareProductImageForUpload(input, {decode: vi.fn(async () => image), render});
    expect(result.repaired).toBe(true);
    expect(result.file.name).toBe('港口照片.webp');
    expect(result.file.type).toBe('image/webp');
    expect(result.note).toContain('4096×2048px');
    expect(render).toHaveBeenCalledWith(image, 4096, 2048, 0.88);
    expect(image.close).toHaveBeenCalled();
  });

  it('无法解码的文件给出文件名和合法上传规格', async () => {
    const input = new File(['broken'], '损坏照片.heic', {type: 'image/heic'});
    await expect(prepareProductImageForUpload(input, {decode: vi.fn(async () => { throw new Error('decode'); })})).rejects.toThrow(/损坏照片\.heic.*JPG、PNG 或 WebP.*10MB.*4096px/);
  });

  it('自动压缩后仍超限时不给不合法文件继续上传', async () => {
    const huge = new Blob([new Uint8Array(PRODUCT_IMAGE_MAX_BYTES + 1)], {type: 'image/webp'});
    const render = vi.fn(async () => huge);
    const input = new File(['bitmap'], '巨大照片.tif', {type: 'image/tiff'});
    await expect(prepareProductImageForUpload(input, {decode: vi.fn(async () => decoded()), render})).rejects.toThrow(/自动压缩后仍超过 10MB/);
    expect(render).toHaveBeenCalledTimes(12);
  });
});
