import {describe,expect,it} from 'vitest';
import {draftContent,draftFromProduct,localizedDraft} from '../src/app/operations/productDraft';
import type {OperationsProduct} from '../src/shared/integrations/supabaseOperations';

const product:OperationsProduct={id:'route-a',slug:'route-a',status:'published',catalogVersion:1,publishedRevision:1,draftRevision:1,title:'路线 A',content:{summary:'简介',description:'路线介绍',highlights:['亮点'],itinerary:[],routeReminders:[{id:'a',type:'weather',sortOrder:0,enabled:true,locales:{'zh-CN':{title:'天气',body:'提醒 A'},en:{title:'Weather',body:'Reminder A'}}},{id:'disabled',type:'other',sortOrder:1,enabled:false,locales:{'zh-CN':{body:'隐藏'}}}],locales:{en:{title:'Route A',tagline:'A line',description:'Route description',highlights:['Highlight']}}},heroImageUrl:null,gallery:[],updatedAt:'2026-09-27'};

describe('route content draft',()=>{
  it('keeps route reminders structured, optional, and locale-specific',()=>{
    const draft=draftFromProduct(product);
    expect(draft.routeReminders).toHaveLength(2);
    expect(localizedDraft(draft,'en').routeReminders).toEqual([{id:'a',type:'weather',sortOrder:0,enabled:true,locales:{en:{title:'Weather',body:'Reminder A'}}}]);
    expect(draftContent(product,draft).routeReminders).toMatchObject([{id:'a',enabled:true},{id:'disabled',enabled:false}]);
  });
  it('does not invent a missing localized route field',()=>{
    const draft=draftFromProduct(product);
    expect(localizedDraft(draft,'ja').tagline).toBe('');
    expect(localizedDraft(draft,'ja').description).toBe('路线介绍');
  });
});
