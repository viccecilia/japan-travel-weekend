import {readFileSync} from 'node:fs';
import {describe, expect, it, vi} from 'vitest';
import {PRODUCT_SPOT_VIDEO_MAX_BYTES, productSpotStableId, validateWebReadySpotVideo} from '../src/app/operations/productSpotVideo';
import {SupabaseOperationsRepository} from '../src/shared/integrations/supabaseOperations';

const migration = readFileSync('supabase/migrations/202609140143_product_spot_video_storage.sql', 'utf8');
const nginx = readFileSync('deploy/nginx/weekend-test-common.conf', 'utf8');
const vite = readFileSync('vite.config.ts', 'utf8');

describe('景点视频上传和版本化引用', () => {
  it('存储桶只增加web-ready MP4并明确50MB上限，仍沿用运营写权限', () => {
    expect(migration).toContain('52428800');
    expect(migration).toContain("'video/mp4'");
    expect(migration).toContain('Existing route_media_* policies remain authoritative');
    expect(nginx).toContain("media-src 'self' blob: https://hzxoofvodpqpdomtmzlf.supabase.co");
    expect(vite).toContain("globIgnores:['**/*.{mp4,mov}']");
  });

  it('旧景点获得确定性ID，新景点ID不会依赖名称', () => {
    expect(productSpotStableId({title: '清水寺'}, 0)).toBe('legacy-stop-1');
    expect(productSpotStableId({id: 'spot-fixed', title: '改名前'}, 0)).toBe('spot-fixed');
    expect(productSpotStableId({id: 'spot-fixed', title: '改名后'}, 4)).toBe('spot-fixed');
  });

  it('拒绝伪MP4和非H264/AAC，接受包含avc1与mp4a标识的受限文件', async () => {
    const invalid = new File(['video'], 'clip.mov', {type: 'video/quicktime'});
    expect(await validateWebReadySpotVideo(invalid)).toContain('仅支持 MP4');
    const wrongCodec = new File(['....ftyp....hev1....mp4a'], 'clip.mp4', {type: 'video/mp4'});
    expect(await validateWebReadySpotVideo(wrongCodec)).toContain('H.264');
    const valid = new File(['....ftyp....avc1....mp4a'], 'clip.mp4', {type: 'video/mp4'});
    await expect(validateWebReadySpotVideo(valid)).resolves.toBeNull();
    expect(PRODUCT_SPOT_VIDEO_MAX_BYTES).toBe(50 * 1024 * 1024);
  });

  it('运营存储上传路径固定到产品和景点，返回持久路径与公开地址', async () => {
    const upload = vi.fn().mockResolvedValue({error: null});
    const bucket = {upload, getPublicUrl: vi.fn().mockReturnValue({data: {publicUrl: 'https://media.test/spot.mp4'}})};
    const client = {auth: {getSession: vi.fn().mockResolvedValue({data: {session: null}})}, storage: {from: vi.fn().mockReturnValue(bucket)}};
    const repository = new SupabaseOperationsRepository(client as never);
    const file = new File(['....avc1....mp4a'], 'spot.mp4', {type: 'video/mp4'});
    const progress = vi.fn();
    await expect(repository.uploadProductSpotVideo('trip-1', 'stop-1', file, progress)).resolves.toMatchObject({url: 'https://media.test/spot.mp4', storagePath: expect.stringMatching(/^trip-1\/stops\/stop-1\/.+\.mp4$/), error: null});
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^trip-1\/stops\/stop-1\/.+\.mp4$/), file, {contentType: 'video/mp4', upsert: false});
    expect(progress).toHaveBeenLastCalledWith(100);
  });
});
