import {readFileSync} from 'node:fs';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {DepartureCenter} from '../src/app/operations/DepartureCenter';
import type {OperationsProduct} from '../src/shared/integrations/supabaseOperations';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';

afterEach(cleanup);

const product=(id:string,status:OperationsProduct['status'],publishedRevision:number|null,draftRevision:number|null=null):OperationsProduct=>({
  id,slug:id,status,catalogVersion:3,publishedRevision,draftRevision,title:id,content:{routeStudioV1:true},heroImageUrl:null,gallery:[],updatedAt:'2026-10-10T00:00:00Z',
});
const baseServices=(listProducts:ReturnType<typeof vi.fn>,overrides:Record<string,unknown>={})=>({operations:{
  listProducts,
  listDepartureCalendar:vi.fn(async()=>({data:[],error:null})),
  listMeetingPointTemplates:vi.fn(async()=>({data:[{id:'mp-1',name:'日本桥2号口',address:'大阪市中央区日本桥',latitude:34.66,longitude:135.5,meetingNote:'2号出口附近集合',active:true,version:1,updatedAt:'2026-10-10T00:00:00Z'}],error:null})),
  previewDepartureBatch:vi.fn(async()=>({data:[],error:null})),createDepartureBatch:vi.fn(),...overrides,
},loadSellableDepartures:async()=>({data:[],error:null}),onAuthStateChange:()=>()=>{},currentUser:async()=>null} as unknown as ProductionBrowserServices);

describe('创建新班次产品选择',()=>{
  it('只显示存在当前已发布版本的上架产品，且不自动选中',async()=>{
    const list=vi.fn(async()=>({data:[
      product('published','published',2),product('published-with-draft','published',2,3),product('draft','draft',null,1),product('archived','archived',2,3),product('broken-published','published',null),
    ],error:null}));
    render(<MemoryRouter><AppProvider services={baseServices(list)}><DepartureCenter/></AppProvider></MemoryRouter>);
    const select=await screen.findByLabelText('产品');
    expect(select).toHaveValue('');
    expect(screen.getByRole('option',{name:'请选择已上架产品'})).toBeInTheDocument();
    expect(screen.getByRole('option',{name:'published'})).toBeInTheDocument();
    expect(screen.getByRole('option',{name:'published-with-draft'})).toBeInTheDocument();
    expect(screen.queryByRole('option',{name:'draft'})).not.toBeInTheDocument();
    expect(screen.queryByRole('option',{name:'archived'})).not.toBeInTheDocument();
    expect(screen.queryByRole('option',{name:'broken-published'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'生成预览'})).toBeDisabled();
  });

  it('没有上架产品时显示产品管理入口并禁止预览',async()=>{
    render(<MemoryRouter><AppProvider services={baseServices(vi.fn(async()=>({data:[product('draft','draft',null,1)],error:null})))}><DepartureCenter/></AppProvider></MemoryRouter>);
    expect(await screen.findByText('暂无已上架产品，请先到产品管理完成发布。',{exact:false})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'前往产品管理'})).toHaveAttribute('href','/app/operations/products');
    expect(screen.getByRole('button',{name:'生成预览'})).toBeDisabled();
  });

  it('新上架且没有历史班次的产品刷新后自动进入选项',async()=>{
    const list=vi.fn().mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:[product('newly-published','published',1)],error:null});
    render(<MemoryRouter><AppProvider services={baseServices(list)}><DepartureCenter/></AppProvider></MemoryRouter>);
    await screen.findByText('暂无已上架产品，请先到产品管理完成发布。',{exact:false});
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByRole('option',{name:'newly-published'})).toBeInTheDocument();
  });

  it('预览后产品下架会清除选择和旧预览，保留其他表单内容且不调用创建',async()=>{
    const published=product('trip-1','published',2,3);
    const archived=product('trip-1','archived',2,3);
    const list=vi.fn().mockResolvedValueOnce({data:[published],error:null}).mockResolvedValueOnce({data:[published],error:null}).mockResolvedValueOnce({data:[archived],error:null});
    const previewDepartureBatch=vi.fn(async()=>({data:[{serviceDate:'2026-10-12',departsAt:'2026-10-12T00:00:00Z',salesOpenAt:'2026-10-10T01:28:00Z',salesCloseAt:'2026-10-11T00:00:00Z',price:8900,capacity:8,meetingName:'日本桥2号口',meetingAddress:'大阪市中央区日本桥',duplicate:false}],error:null}));
    const createDepartureBatch=vi.fn();
    render(<MemoryRouter><AppProvider services={baseServices(list,{previewDepartureBatch,createDepartureBatch})}><DepartureCenter/></AppProvider></MemoryRouter>);
    await screen.findByRole('option',{name:'trip-1'});
    fireEvent.change(screen.getByLabelText('产品'),{target:{value:'trip-1'}});
    fireEvent.change(screen.getByLabelText('开始日期'),{target:{value:'2026-10-12'}});
    fireEvent.change(screen.getByLabelText('结束日期'),{target:{value:'2026-10-12'}});
    fireEvent.change(screen.getByLabelText('星期（1=周一，7=周日）'),{target:{value:'1'}});
    fireEvent.change(screen.getByLabelText('每席价格（日元）'),{target:{value:'8900'}});
    fireEvent.change(screen.getByLabelText('销售容量'),{target:{value:'8'}});
    fireEvent.change(screen.getByLabelText('开始销售'),{target:{value:'2026-10-10T10:28'}});
    fireEvent.change(screen.getByLabelText('集合地点'),{target:{value:'mp-1'}});
    fireEvent.click(screen.getByRole('button',{name:'生成预览'}));
    expect(await screen.findByRole('heading',{name:'1 个候选班次'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'确认创建'}));
    expect(await screen.findByText('该产品已下架，请重新选择产品')).toBeInTheDocument();
    expect(screen.getByLabelText('产品')).toHaveValue('');
    expect(screen.getByLabelText('每席价格（日元）')).toHaveValue(8900);
    expect(screen.queryByRole('heading',{name:'1 个候选班次'})).not.toBeInTheDocument();
    expect(createDepartureBatch).not.toHaveBeenCalled();
  });

  it('预览后手动切换产品会清除旧预览，不会用旧产品确认创建',async()=>{
    const first=product('trip-1','published',2);
    const second=product('trip-2','published',1);
    const list=vi.fn(async()=>({data:[first,second],error:null}));
    const previewDepartureBatch=vi.fn(async()=>({data:[{serviceDate:'2026-10-12',departsAt:'2026-10-12T00:00:00Z',salesOpenAt:'2026-10-10T01:28:00Z',salesCloseAt:'2026-10-11T00:00:00Z',price:8900,capacity:8,meetingName:'日本桥2号口',meetingAddress:'大阪市中央区日本桥',duplicate:false}],error:null}));
    const createDepartureBatch=vi.fn();
    render(<MemoryRouter><AppProvider services={baseServices(list,{previewDepartureBatch,createDepartureBatch})}><DepartureCenter/></AppProvider></MemoryRouter>);
    await screen.findByRole('option',{name:'trip-1'});
    fireEvent.change(screen.getByLabelText('产品'),{target:{value:'trip-1'}});
    fireEvent.change(screen.getByLabelText('开始日期'),{target:{value:'2026-10-12'}});
    fireEvent.change(screen.getByLabelText('结束日期'),{target:{value:'2026-10-12'}});
    fireEvent.change(screen.getByLabelText('星期（1=周一，7=周日）'),{target:{value:'1'}});
    fireEvent.change(screen.getByLabelText('每席价格（日元）'),{target:{value:'8900'}});
    fireEvent.change(screen.getByLabelText('销售容量'),{target:{value:'8'}});
    fireEvent.change(screen.getByLabelText('开始销售'),{target:{value:'2026-10-10T10:28'}});
    fireEvent.change(screen.getByLabelText('集合地点'),{target:{value:'mp-1'}});
    fireEvent.click(screen.getByRole('button',{name:'生成预览'}));
    expect(await screen.findByRole('heading',{name:'1 个候选班次'})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('产品'),{target:{value:'trip-2'}});
    expect(screen.queryByRole('heading',{name:'1 个候选班次'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'确认创建'})).not.toBeInTheDocument();
    expect(createDepartureBatch).not.toHaveBeenCalled();
  });
});

describe('班次服务端上架状态保护',()=>{
  const departureSql=readFileSync('supabase/migrations/20261010014701_departure_sales_cutoff_meeting_point_library.sql','utf8');
  const revisionSql=readFileSync('supabase/migrations/202609090091_product_revision_publication.sql','utf8');
  it('预览直接拒绝草稿、已下架或无已发布版本的产品',()=>{
    expect(departureSql).toContain("v_trip.status<>'published' or v_trip.current_published_revision_id is null");
    expect(departureSql).toContain('"product_not_published"');
  });
  it('确认创建在任何 insert 前重新调用预览校验，因此下架竞态不会部分建班',()=>{
    const createBody=departureSql.slice(departureSql.indexOf('create function public.operations_create_departure_batch'),departureSql.indexOf('-- The quote remains'));
    expect(createBody.indexOf('perform public.operations_preview_departure_batch')).toBeGreaterThan(0);
    expect(createBody.indexOf('perform public.operations_preview_departure_batch')).toBeLessThan(createBody.indexOf('for day in select'));
    expect(createBody.indexOf('for day in select')).toBeLessThan(createBody.indexOf('insert into public.departures'));
  });
  it('保存草稿只更新 draft pointer，不覆盖当前已发布内容',()=>{
    const saveBody=revisionSql.slice(revisionSql.indexOf('create or replace function public.operations_save_product_draft'),revisionSql.indexOf('create or replace function public.operations_publish_product'));
    expect(saveBody).toContain('current_draft_revision_id=created_id');
    expect(saveBody).not.toMatch(/update public\.trips set[^;]*(?:title|content|current_published_revision_id)=/s);
  });
});
