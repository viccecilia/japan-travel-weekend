import {describe,expect,it,vi} from 'vitest';
import {SupabaseOperationsRepository} from '../src/shared/integrations/supabaseOperations';

function makeRepository(){
  const upload=vi.fn().mockResolvedValue({error:null});
  const getPublicUrl=vi.fn().mockReturnValue({data:{publicUrl:'https://example.invalid/route-media/object'}});
  const rpc=vi.fn().mockResolvedValue({data:'media-id',error:null});
  const client={auth:{getSession:vi.fn().mockResolvedValue({data:{session:{access_token:'test-token'}}})},storage:{from:vi.fn().mockReturnValue({upload,getPublicUrl})},rpc};
  return {repository:new SupabaseOperationsRepository(client as never),upload,getPublicUrl,rpc};
}

describe('SupabaseOperationsRepository attraction media',()=>{
  it('uploads supported media then records its attraction metadata',async()=>{
    const {repository,upload,rpc}=makeRepository();
    const file=new File(['image'], 'garden.jpg',{type:'image/jpeg'});
    const result=await repository.uploadAttractionMedia({attractionId:'00000000-0000-4000-8000-000000000001',slug:'test-garden',file,orientation:'landscape',season:'autumn'});
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({id:'media-id',mediaType:'image',status:'active',orientation:'landscape',season:'autumn',originalFilename:'garden.jpg'});
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^attractions\/00000000-0000-4000-8000-000000000001\/.+\.jpg$/),file,{contentType:'image/jpeg',upsert:false});
    expect(rpc).toHaveBeenCalledWith('create_operations_attraction_media',expect.objectContaining({p_slug:'test-garden',p_media_type:'image',p_orientation:'landscape',p_season:'autumn'}));
  });
  it('rejects unsupported content before it reaches Storage',async()=>{
    const {repository,upload}=makeRepository();
    const file=new File(['not a video'], 'bad.mov',{type:'video/quicktime'});
    await expect(repository.uploadAttractionMedia({attractionId:'id',slug:'test-garden',file,orientation:'unknown',season:'all-season'})).resolves.toEqual({data:null,error:'仅支持不超过 50MB 的 JPG、PNG、WebP 或 MP4 文件'});
    expect(upload).not.toHaveBeenCalled();
  });
  it('updates season and active state through the operations-only RPC',async()=>{
    const {repository,rpc}=makeRepository();
    rpc.mockResolvedValueOnce({error:null});
    await expect(repository.updateAttractionMedia('media-id','winter','inactive')).resolves.toEqual({ok:true,error:null});
    expect(rpc).toHaveBeenLastCalledWith('update_operations_attraction_media',{p_media:'media-id',p_season:'winter',p_status:'inactive'});
  });
});
