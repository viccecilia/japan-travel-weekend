import {readFileSync} from 'node:fs';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AppProvider} from '../src/app/store';
import {DepartureCenter} from '../src/app/operations/DepartureCenter';
import {SupabaseOperationsRepository} from '../src/shared/integrations/supabaseOperations';
import type {ProductionBrowserServices} from '../src/shared/backend/productionServices';
import type {OperationsProduct} from '../src/shared/integrations/supabaseOperations';

const migration=readFileSync('supabase/migrations/20261010014701_departure_sales_cutoff_meeting_point_library.sql','utf8');
const auditTargetPatch=readFileSync('supabase/migrations/20261010021805_allow_meeting_point_audit_target.sql','utf8');
const page=readFileSync('src/app/operations/DepartureCenter.tsx','utf8');
afterEach(cleanup);
const selectableProduct=(id='trip-1',status:OperationsProduct['status']='published'):OperationsProduct=>({id,slug:id,status,catalogVersion:2,publishedRevision:status==='published'?1:null,draftRevision:null,title:'测试路线',content:{routeStudioV1:true},heroImageUrl:null,gallery:[],updatedAt:'2026-10-10T00:00:00Z'});

describe('销售截止与集合地点快照 migration',()=>{
  it('按 JST 从每个班次时间减去截止小时并在预览逐条返回',()=>{
    expect(migration).toContain("at time zone 'Asia/Tokyo'");
    expect(migration).toContain("make_interval(hours=>p_close_hours)");
    expect(migration).toContain("'salesCloseAt'");
    expect(migration).toContain("'salesOpenAt'");
    expect(migration).toContain("'meetingName'");
    expect(migration).toContain("'meetingAddress'");
  });

  it('拒绝开始销售不早于最早实际班次截止时间',()=>{
    expect(migration).toContain('min(((day::date)+p_departure_time)');
    expect(migration).toContain('p_sales_open>=v_first_departure-make_interval(hours=>p_close_hours)');
    expect(migration).toContain('"sales_window"');
  });

  it('模板只复制到 Departure 和新订单快照，不反向联动历史数据',()=>{
    expect(migration).toContain('create table public.meeting_point_templates');
    expect(migration).toContain('meeting_point_template_id');
    expect(migration).toContain('meeting_instruction');
    expect(migration).toContain('meeting_latitude');
    expect(migration).toContain('meeting_longitude');
    expect(migration).toContain('lock_quote_meeting_snapshot');
    expect(migration).toContain('q.meeting_point_template_id,q.meeting_name,q.meeting_address');
    expect(migration).toContain('q.commercial_terms');
    expect(migration).toContain('q.policy_template_version_id,q.service_time_policy_version_id,q.cancellation_policy_version_id');
    expect(migration).not.toMatch(/update public\.departures[\s\S]{0,200}from public\.meeting_point_templates/);
    expect(migration).not.toMatch(/update public\.order_snapshots/);
  });

  it('班次手动修改集合信息会脱离模板，但不改写旧订单快照',()=>{
    expect(migration).toContain('meeting_point_template_id=case when meeting_changed then null');
    expect(migration).toContain("'meetingTemplateDetached',meeting_changed");
    expect(migration).not.toMatch(/update public\.order_quotes/);
  });

  it('启停只影响选择列表并使用与约束一致的审计动作',()=>{
    expect(migration).toContain('where p_include_inactive or m.active');
    for(const action of ['meeting_point_created','meeting_point_updated','meeting_point_activated','meeting_point_deactivated']){
      expect(migration.match(new RegExp(action,'g'))?.length).toBeGreaterThanOrEqual(2);
    }
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('revoke all on public.meeting_point_templates from public,anon,authenticated');
    expect(auditTargetPatch).toContain("'meeting_point_template'");
  });
});

describe('Operations repository 集成',()=>{
  it('预览和创建都发送同一份模板快照',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:[],error:null});
    const repository=new SupabaseOperationsRepository({rpc} as never);
    const input={tripId:'trip',start:'2026-10-12',end:'2026-10-13',weekdays:[1,2],departureTime:'09:00',durationMinutes:600,price:8900,capacity:8,salesOpen:'2026-10-10T01:28:00Z',closeHours:24,meetingTemplateId:'mp-1',meetingName:'日本桥2号口',meetingAddress:'大阪市中央区日本桥',mapLat:34.66,mapLng:135.5,meetingInstruction:'2号出口附近集合'};
    await repository.previewDepartureBatch(input);
    await repository.createDepartureBatch({...input,operationId:'op-1'});
    for(const call of rpc.mock.calls){expect(call[1]).toEqual(expect.objectContaining({p_meeting_template:'mp-1',p_meeting_name:'日本桥2号口',p_meeting_instruction:'2号出口附近集合',p_close_hours:24}))}
  });

  it('集合地点 create/update/deactivate 使用独立受控 RPC',async()=>{
    const rpc=vi.fn().mockResolvedValue({data:2,error:null});
    const repository=new SupabaseOperationsRepository({rpc} as never);
    await repository.createMeetingPointTemplate({name:'日本桥2号口',address:'大阪市中央区日本桥',latitude:34.66,longitude:135.5,meetingNote:'2号出口附近集合',active:true});
    await repository.updateMeetingPointTemplate({id:'mp-1',expectedVersion:1,name:'日本桥2号口',address:'大阪市中央区日本桥',latitude:34.66,longitude:135.5,meetingNote:'更新说明'});
    await repository.setMeetingPointTemplateActive('mp-1',2,false);
    expect(rpc.mock.calls.map(call=>call[0])).toEqual(['operations_create_meeting_point_template','operations_update_meeting_point_template','operations_set_meeting_point_template_active']);
  });
});

describe('创建班次预览 UI',()=>{
  it('模板选择自动带出快照并显示单班次销售截止、价格与集合信息',async()=>{
    const previewDepartureBatch=vi.fn(async()=>({data:[{serviceDate:'2026-10-12',departsAt:'2026-10-12T00:00:00Z',salesOpenAt:'2026-10-10T01:28:00Z',salesCloseAt:'2026-10-11T00:00:00Z',price:8900,capacity:8,meetingName:'日本桥2号口',meetingAddress:'大阪市中央区日本桥',duplicate:false}],error:null}));
    const createDepartureBatch=vi.fn(async()=>({data:{created:1,skippedDuplicates:0},error:null}));
    const services={operations:{
      listProducts:vi.fn(async()=>({data:[selectableProduct()],error:null})),
      listDepartureCalendar:vi.fn(async()=>({data:[],error:null})),
      listMeetingPointTemplates:vi.fn(async()=>({data:[{id:'mp-1',name:'日本桥2号口',address:'大阪市中央区日本桥',latitude:34.66,longitude:135.5,meetingNote:'2号出口附近集合',active:true,version:1,updatedAt:'2026-10-10T00:00:00Z'}],error:null})),
      previewDepartureBatch,createDepartureBatch,
    },loadSellableDepartures:async()=>({data:[],error:null}),onAuthStateChange:()=>()=>{},currentUser:async()=>null} as unknown as ProductionBrowserServices;
    render(<MemoryRouter><AppProvider services={services}><DepartureCenter/></AppProvider></MemoryRouter>);
    const option=await screen.findByRole('option',{name:'日本桥2号口'});
    fireEvent.change(screen.getByLabelText('产品'),{target:{value:'trip-1'}});
    fireEvent.change(option.parentElement!,{target:{name:'meetingTemplateId',value:'mp-1'}});
    expect(await screen.findByTestId('meeting-point-summary')).toHaveTextContent('2号出口附近集合');
    fireEvent.change(screen.getByLabelText('开始日期'),{target:{value:'2026-10-12'}});
    fireEvent.change(screen.getByLabelText('结束日期'),{target:{value:'2026-10-12'}});
    fireEvent.change(screen.getByLabelText('星期（1=周一，7=周日）'),{target:{value:'1'}});
    fireEvent.change(screen.getByLabelText('每席价格（日元）'),{target:{value:'8900'}});
    fireEvent.change(screen.getByLabelText('销售容量'),{target:{value:'8'}});
    fireEvent.change(screen.getByLabelText('开始销售'),{target:{value:'2026-10-10T10:28'}});
    expect(screen.getByLabelText('预计销售截止')).toHaveValue('2026-10-11 09:00');
    fireEvent.click(screen.getByRole('button',{name:'生成预览'}));
    await waitFor(()=>expect(previewDepartureBatch).toHaveBeenCalledWith(expect.objectContaining({meetingTemplateId:'mp-1',meetingName:'日本桥2号口',meetingInstruction:'2号出口附近集合'})));
    expect(await screen.findByText('2026-10-11 09:00')).toBeInTheDocument();
    expect(screen.getByText('¥8900')).toBeInTheDocument();
    expect(screen.getAllByText('日本桥2号口').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button',{name:'确认创建'}));
    await waitFor(()=>expect(createDepartureBatch).toHaveBeenCalledWith(expect.objectContaining({meetingTemplateId:'mp-1'})));
  });

  it('批量建班显示最早截止时间并在预览前拦截冲突',async()=>{
    const previewDepartureBatch=vi.fn(async()=>({data:[],error:null}));
    const services={operations:{
      listProducts:vi.fn(async()=>({data:[selectableProduct()],error:null})),
      listDepartureCalendar:vi.fn(async()=>({data:[],error:null})),
      listMeetingPointTemplates:vi.fn(async()=>({data:[],error:null})),
      previewDepartureBatch,createDepartureBatch:vi.fn(),
    },loadSellableDepartures:async()=>({data:[],error:null}),onAuthStateChange:()=>()=>{},currentUser:async()=>null} as unknown as ProductionBrowserServices;
    render(<MemoryRouter><AppProvider services={services}><DepartureCenter/></AppProvider></MemoryRouter>);
    await screen.findByRole('option',{name:'测试路线'});
    fireEvent.change(screen.getByLabelText('产品'),{target:{value:'trip-1'}});
    fireEvent.change(screen.getByLabelText('开始日期'),{target:{value:'2026-10-12'}});
    fireEvent.change(screen.getByLabelText('结束日期'),{target:{value:'2026-12-31'}});
    fireEvent.change(screen.getByLabelText('星期（1=周一，7=周日）'),{target:{value:'1,2,3,4,5'}});
    fireEvent.change(screen.getByLabelText('开始销售'),{target:{value:'2026-10-11T11:28'}});
    expect(screen.getByLabelText('预计销售截止')).toHaveValue('最早 2026-10-11 09:00（各班次独立计算）');
    expect(screen.getByRole('alert')).toHaveTextContent('开始销售时间 2026-10-11 11:28 必须早于最早销售截止时间 2026-10-11 09:00');
    expect(screen.getByRole('button',{name:'生成预览'})).toBeDisabled();
    expect(previewDepartureBatch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('开始销售'),{target:{value:'2026-10-10T11:28'}});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'生成预览'})).toBeEnabled();
  });

  it('预览仍逐条显示每个班次的实际截止和集合信息',()=>{
    expect(page).toContain('各班次独立计算');
    expect(page).toContain('item.salesCloseAt');
    expect(page).toContain('item.meetingName');
  });
});
