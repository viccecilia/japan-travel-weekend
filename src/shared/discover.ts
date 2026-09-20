import type {PassengerLocale} from './i18n/passengerLocale';
import type {Trip} from './types';

export type DiscoverHero = {
  id: string;
  video_url: string;
  poster_url: string;
  product_id: string | null;
  product_slug: string | null;
  translations: Partial<Record<PassengerLocale, {title: string; subtitle: string}>>;
  enabled: boolean;
  sort_order: number;
  version: number;
};

// Initial static content is only used before the new content table is available.
// A successful empty response is authoritative: disabling all heroes stays empty.
export const initialDiscoverHeroes: DiscoverHero[] = [
  {id:'ca631d49-42ee-4c6c-9630-09275e838001',video_url:'/media/discover/autumn-soul.mp4',poster_url:'/media/discover/autumn-soul.jpg',product_id:null,product_slug:null,translations:{'zh-CN':{title:'这一生，\n总要看一次京都的秋天。',subtitle:'这个秋天，别只在照片里见过京都。'}},enabled:true,sort_order:0,version:0},
  {id:'ca631d49-42ee-4c6c-9630-09275e838002',video_url:'/media/discover/amanohashidate-ine.mp4',poster_url:'/media/discover/amanohashidate-ine.jpg',product_id:null,product_slug:'amanohashidate-ine',translations:{},enabled:true,sort_order:1,version:0},
  {id:'ca631d49-42ee-4c6c-9630-09275e838003',video_url:'/media/discover/katsuoji-arashiyama.mp4',poster_url:'/media/discover/katsuoji-arashiyama.jpg',product_id:null,product_slug:'miyama-katsuoji-arashiyama',translations:{},enabled:true,sort_order:2,version:0},
];
export const discoverLabels: Record<PassengerLocale, {discover:string;trips:string;view:string;previous:string;next:string;empty:string}> = {
 'zh-CN':{discover:'发现',trips:'精选线路',view:'查看旅程 →',previous:'上一屏',next:'下一屏',empty:'暂无发现内容'},
 'zh-TW':{discover:'發現',trips:'精選路線',view:'查看旅程 →',previous:'上一屏',next:'下一屏',empty:'暫無發現內容'},
 en:{discover:'Discover',trips:'Routes',view:'View journey →',previous:'Previous',next:'Next',empty:'No stories available'},
 ja:{discover:'発見',trips:'厳選コース',view:'旅程を見る →',previous:'前へ',next:'次へ',empty:'コンテンツは準備中です'},
 ko:{discover:'발견',trips:'추천 코스',view:'여정 보기 →',previous:'이전',next:'다음',empty:'콘텐츠 준비 중'},
 es:{discover:'Descubrir',trips:'Rutas',view:'Ver viaje →',previous:'Anterior',next:'Siguiente',empty:'Sin contenido disponible'},
 vi:{discover:'Khám phá',trips:'Tuyến chọn',view:'Xem hành trình →',previous:'Trước',next:'Tiếp',empty:'Chưa có nội dung'},
 ne:{discover:'खोज',trips:'छानिएका रुट',view:'यात्रा हेर्नुहोस् →',previous:'अघिल्लो',next:'अर्को',empty:'सामग्री उपलब्ध छैन'},
};
export function visibleDiscoverHeroes(heroes: DiscoverHero[], trips: Trip[]) {
 return heroes.filter(hero=>hero.enabled && (!hero.product_id && !hero.product_slug || trips.some(trip=>hero.product_id ? trip.id===hero.product_id : trip.slug===hero.product_slug))).sort((a,b)=>a.sort_order-b.sort_order||a.id.localeCompare(b.id));
}
export function discoverProduct(hero: DiscoverHero, trips: Trip[]) {
 return trips.find(trip=>hero.product_id ? trip.id===hero.product_id : !!hero.product_slug && trip.slug===hero.product_slug);
}
export function discoverText(hero: DiscoverHero, locale: PassengerLocale, trip?: Trip) {
 const source=hero.translations['zh-CN'];
 const localized=hero.translations[locale];
 return {title:localized?.title || source?.title || String(trip?.localizedContent?.[locale]?.title || trip?.title || ''),subtitle:localized?.subtitle || source?.subtitle || ''};
}
