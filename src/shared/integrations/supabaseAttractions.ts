import type {SupabaseClient} from '@supabase/supabase-js';
import type {AttractionLocale} from '../attractions';

export type PublicAttractionGuide={
  id:string;slug:string;locale:AttractionLocale;title:string;body:string;
  audioUrl:string|null;audioStatus:string|null;audioVoice:string|null;
};

export type PublicAttractionMedia={
  id:string;mediaType:'image'|'video';storagePath:string;originalFilename:string;
  orientation:'landscape'|'portrait'|'square'|'unknown';season:'all-season'|'spring'|'summer'|'autumn'|'winter';url:string;
};

/** Public guide content is read through a narrowly-scoped published-only RPC. */
export class SupabaseAttractionGuideRepository {
  constructor(private readonly client:SupabaseClient|null){}
  async load(slug:string,locale:AttractionLocale){
    if(!this.client)return {data:null as PublicAttractionGuide|null,error:'导览服务未配置'};
    const {data,error}=await this.client.rpc('get_public_attraction_guide',{p_slug:slug,p_locale:locale});
    const row=(Array.isArray(data)?data[0]:data) as Record<string,unknown>|null;
    const guide=row?{
      id:String(row.id),slug:String(row.slug),locale:String(row.locale) as AttractionLocale,
      title:String(row.title),body:String(row.body),
      audioUrl:typeof row.audio_url==='string'?row.audio_url:null,
      audioStatus:typeof row.audio_status==='string'?row.audio_status:null,
      audioVoice:typeof row.audio_voice==='string'?row.audio_voice:null,
    } satisfies PublicAttractionGuide:null;
    return {data:guide,error:error?.message??null};
  }
  async loadMedia(slug:string){
    if(!this.client)return {data:[] as PublicAttractionMedia[],error:'导览服务未配置'};
    const {data,error}=await this.client.rpc('get_public_attraction_media',{p_slug:slug});
    const rows=Array.isArray(data)?data as Record<string,unknown>[]:[];
    const media=rows.map((row)=>{
      const storagePath=String(row.storage_path);
      const {data:urlData}=this.client!.storage.from('route-media').getPublicUrl(storagePath);
      return {
        id:String(row.id),mediaType:String(row.media_type) as PublicAttractionMedia['mediaType'],storagePath,
        originalFilename:String(row.original_filename),orientation:String(row.orientation) as PublicAttractionMedia['orientation'],
        season:String(row.season) as PublicAttractionMedia['season'],url:urlData.publicUrl,
      } satisfies PublicAttractionMedia;
    });
    return {data:media,error:error?.message??null};
  }
}
