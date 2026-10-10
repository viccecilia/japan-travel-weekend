import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,describe,expect,it} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {attractionGuideCorpus,attractionGuideImportReport,type AttractionRecord} from '../src/shared/attractions/guideCorpus.generated';
import {attractionGuideHref,resolveAttractionId} from '../src/shared/attractions';
import {AttractionGuidePage} from '../src/app/AttractionGuidePage';
import {AppProvider} from '../src/app/store';
import {trips} from '../src/shared/data/trips';

afterEach(cleanup);
describe('Attraction Guide mapping',()=>{
  it('keeps a complete seven-language guide and audio manifest mapping for each imported attraction',()=>{
    expect(attractionGuideImportReport.attractions).toBe((attractionGuideCorpus as AttractionRecord[]).length);
    expect(attractionGuideImportReport.guideEntries).toBe((attractionGuideCorpus as AttractionRecord[]).reduce((total,item)=>total+Object.keys(item.guides).length,0));
    expect(attractionGuideImportReport.audioMappings).toBe((attractionGuideCorpus as AttractionRecord[]).reduce((total,item)=>total+Object.keys(item.audio).length,0));
    expect(attractionGuideImportReport).toMatchObject({missing:0,duplicates:0,unmatched:0});
    for(const attraction of attractionGuideCorpus as AttractionRecord[]){
      expect(Object.keys(attraction.guides)).toHaveLength(7);expect(Object.keys(attraction.audio)).toHaveLength(7);
      expect(attraction.audio['zh-CN'].audioUrl).toBeNull();
    }
  });
  it('resolves an existing route stop by canonical attraction id without copying guide text into the route',()=>{
    expect(resolveAttractionId({title:'金阁寺'},'zh-CN')).toBe('kinkaku-ji');
    expect(resolveAttractionId({title:'二年坂·三年坂'},'zh-CN')).toBe('ninenzaka-sannenzaka');
    expect(attractionGuideHref('kinkaku-ji','/app/trips/kyoto')).toContain('/app/attractions/kinkaku-ji');
  });
  it('lets itinerary stops from more than one route share one public guide record',()=>{
    const routeA={title:'金阁寺',attractionId:'kinkaku-ji'};
    const routeB={title:'金閣寺',attractionId:'kinkaku-ji'};
    expect(resolveAttractionId(routeA,'zh-CN')).toBe(resolveAttractionId(routeB,'ja'));
    expect((attractionGuideCorpus as AttractionRecord[]).filter(item=>item.slug==='kinkaku-ji')).toHaveLength(1);
    const existingStop=trips.find(trip=>trip.slug==='arashiyama-train-hozugawa')?.timeline.find(stop=>stop.title==='金阁寺');
    expect(existingStop&&resolveAttractionId(existingStop,'zh-CN')).toBe('kinkaku-ji');
  });
  it('renders the selected locale and hides the audio UI until an audio asset is published',()=>{
    render(<MemoryRouter initialEntries={['/app/attractions/kinkaku-ji']}><AppProvider><Routes><Route path="/app/attractions/:attractionId" element={<AttractionGuidePage/>}/></Routes></AppProvider></MemoryRouter>);
    expect(screen.getByRole('heading',{name:'金阁寺'})).toBeTruthy();
    expect(screen.queryByLabelText('语音导览')).toBeNull();
  });
  it('does not expose bundled guide content when the public RPC rejects an unpublished attraction',async()=>{
    const services={loadAttractionGuide:async()=>({data:null,error:null}),loadAttractionMedia:async()=>({data:[],error:null}),loadSellableDepartures:async()=>({data:[],error:null}),currentUser:async()=>null,onAuthStateChange:()=>()=>{}};
    render(<MemoryRouter initialEntries={['/app/attractions/kinkaku-ji']}><AppProvider services={services as never}><Routes><Route path="/app/attractions/:attractionId" element={<AttractionGuidePage/>}/></Routes></AppProvider></MemoryRouter>);
    expect(await screen.findByRole('heading',{name:'Guide unavailable'})).toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'金阁寺'})).not.toBeInTheDocument();
  });
});
