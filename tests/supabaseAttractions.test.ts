import {describe,expect,it,vi} from 'vitest';
import {SupabaseAttractionGuideRepository} from '../src/shared/integrations/supabaseAttractions';

describe('SupabaseAttractionGuideRepository',()=>{
  it('maps public guide RPC snake_case audio fields for the passenger player',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:[{id:'guide-id',slug:'test-garden',locale:'zh-CN',title:'测试庭园',body:'正文',audio_url:'https://example.invalid/test.mp3',audio_status:'published',audio_voice:'test-voice'}],error:null});
    const repository=new SupabaseAttractionGuideRepository({rpc} as never);
    await expect(repository.load('test-garden','zh-CN')).resolves.toEqual({data:{id:'guide-id',slug:'test-garden',locale:'zh-CN',title:'测试庭园',body:'正文',audioUrl:'https://example.invalid/test.mp3',audioStatus:'published',audioVoice:'test-voice'},error:null});
  });
});
