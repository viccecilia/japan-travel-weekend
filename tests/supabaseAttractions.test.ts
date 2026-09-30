import {describe,expect,it,vi} from 'vitest';
import {SupabaseAttractionGuideRepository} from '../src/shared/integrations/supabaseAttractions';

describe('SupabaseAttractionGuideRepository',()=>{
  it('maps public guide RPC snake_case audio fields for the passenger player',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:[{id:'guide-id',slug:'test-garden',locale:'zh-CN',title:'测试庭园',body:'正文',audio_url:'https://example.invalid/test.mp3',audio_status:'published',audio_voice:'test-voice'}],error:null});
    const repository=new SupabaseAttractionGuideRepository({rpc} as never);
    await expect(repository.load('test-garden','zh-CN')).resolves.toEqual({data:{id:'guide-id',slug:'test-garden',locale:'zh-CN',title:'测试庭园',body:'正文',audioUrl:'https://example.invalid/test.mp3',audioStatus:'published',audioVoice:'test-voice'},error:null});
  });
  it('reads only RPC-authorized attraction media and turns storage paths into display URLs',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:[{id:'media-id',media_type:'image',storage_path:'attractions/attraction-id/photo.jpg',original_filename:'photo.jpg',orientation:'landscape',season:'autumn'}],error:null});
    const getPublicUrl=vi.fn().mockReturnValue({data:{publicUrl:'https://example.invalid/media/photo.jpg'}});
    const repository=new SupabaseAttractionGuideRepository({rpc,storage:{from:vi.fn().mockReturnValue({getPublicUrl})}} as never);
    await expect(repository.loadMedia('test-garden')).resolves.toEqual({data:[{id:'media-id',mediaType:'image',storagePath:'attractions/attraction-id/photo.jpg',originalFilename:'photo.jpg',orientation:'landscape',season:'autumn',url:'https://example.invalid/media/photo.jpg'}],error:null});
    expect(rpc).toHaveBeenCalledWith('get_public_attraction_media',{p_slug:'test-garden'});
  });
});
