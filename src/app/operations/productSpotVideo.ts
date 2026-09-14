export const PRODUCT_SPOT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export type ProductSpotVideo = {
  url: string;
  storagePath: string;
  posterUrl?: string;
  mimeType: 'video/mp4';
  sizeBytes: number;
};

export function productSpotStableId(item: Record<string, unknown>, index: number) {
  const existing = item.id ?? item.stopId ?? item.placeId;
  return existing ? String(existing) : `legacy-stop-${index + 1}`;
}

export async function validateWebReadySpotVideo(file: File) {
  if (file.type !== 'video/mp4' || !file.name.toLowerCase().endsWith('.mp4')) {
    return '仅支持 MP4 文件（H.264 视频／AAC 音频）';
  }
  if (file.size <= 0 || file.size > PRODUCT_SPOT_VIDEO_MAX_BYTES) {
    return '视频必须大于 0 且不超过 50MB';
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = new TextDecoder('latin1').decode(bytes);
  if (!text.includes('avc1') && !text.includes('avc3')) return '视频轨道不是可验证的 H.264（avc1/avc3）';
  if (!text.includes('mp4a')) return '音频轨道不是可验证的 AAC（mp4a）';
  return null;
}
