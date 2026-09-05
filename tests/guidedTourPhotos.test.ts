import {describe,expect,it,vi} from 'vitest';
import {kiyomizuArashiyamaGuide} from '../src/shared/data/guidedTours';
import {initialGuidedTourPhoto,loadGuidedTourPhoto} from '../src/shared/services/guidedTourPhotos';
describe('guided tour photos',()=>{
 it('never requests Google photos for operational nodes',async()=>{const node=kiyomizuArashiyamaGuide.nodes.find(item=>item.kind==='dropoff')!;const fetcher=vi.fn();expect((await loadGuidedTourPhoto(node,'key',fetcher as never)).source).toBe('fallback');expect(fetcher).not.toHaveBeenCalled()});
 it('falls back safely when Places fails',async()=>{const node=kiyomizuArashiyamaGuide.nodes.find(item=>item.id==='kiyomizu-niomon')!;const fetcher=vi.fn().mockResolvedValue({ok:false});expect((await loadGuidedTourPhoto(node,'key',fetcher as never)).source).toBe('fallback')});
 it('returns attribution and Maps source',async()=>{const node=kiyomizuArashiyamaGuide.nodes.find(item=>item.id==='kiyomizu-niomon')!;const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({places:[{displayName:{text:'清水寺'},googleMapsUri:'https://maps.example/place',photos:[{name:'places/x/photos/y',authorAttributions:[{displayName:'Author',uri:'https://maps.example/author'}]}]}]})}).mockResolvedValueOnce({ok:true,json:async()=>({photoUri:'https://lh3.example/photo'})});expect(await loadGuidedTourPhoto(node,'key',fetcher as never)).toMatchObject({source:'google',authorName:'Author',googleMapsUri:'https://maps.example/place'})});
 it('prefers platform-owned photos',()=>{const base=kiyomizuArashiyamaGuide.nodes[0];expect(initialGuidedTourPhoto({...base,photos:{...base.photos,owned:{url:'/own.jpg',alt:'实拍'}}})).toMatchObject({source:'owned',url:'/own.jpg'})});
});
