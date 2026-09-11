import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StaffPortal, StaffTaskAction } from "../src/app/StaffPortal";
import { AppProvider } from "../src/app/store";
import { ProductionBrowserServices } from "../src/shared/backend/productionServices";

afterEach(cleanup);
const task = {
  staff_assignment_id: "assignment-1",
  assignment_role: "driver",
  vehicle_group_id: "group-1",
  room_id: "room-1",
  room_status: "open",
  departure_id: "departure-1",
  trip_title: "京都与奈良",
  departs_at: "2026-09-01T00:00:00Z",
  meeting_name: "大阪梅田",
  meeting_address: "受控地址",
  map_lat: null,
  map_lng: null,
  vehicle_sequence: 1,
  vehicle_type: "hiace-13",
  vehicle_label: "Hiace 1号车",
  vehicle_capacity: 13,
  booked_seats: 12,
  passenger_count: 12,
  boarded_count: 8,
  journey_status: "in_progress",
};

describe("工作人员端", () => {
  const renderTodayWithTasks=(rows:Array<typeof task>)=>{
    const client={auth:{getUser:async()=>({data:{user:{id:'staff-selection',email:'selection@example.invalid'}},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name:string)=>name==='get_staff_portal_tasks'?{data:rows,error:null}:{data:null,error:null}} as unknown as SupabaseClient;
    render(<MemoryRouter initialEntries={['/staff']}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Routes><Route path="/staff/*" element={<StaffPortal/>}/></Routes></AppProvider></MemoryRouter>);
  };
  const atTokyoHour=(dayOffset:number,hour:number)=>{
    const date=new Date();
    const tokyo=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    return new Date(`${tokyo}T${String(hour).padStart(2,'0')}:00:00+09:00`).getTime()+dayOffset*86_400_000;
  };
  it.each([
    ['已完成+待执行','completed','pending'],
    ['已取消+待执行','cancelled','pending'],
  ])('首页组件在%s时只选择待执行任务',async(_case,terminal,pending)=>{
    renderTodayWithTasks([
      {...task,staff_assignment_id:'terminal',trip_title:'不可成为主任务',journey_status:terminal,departs_at:new Date(atTokyoHour(0,8)).toISOString()},
      {...task,staff_assignment_id:'pending',trip_title:'今日正确任务',journey_status:pending,departs_at:new Date(atTokyoHour(0,10)).toISOString()},
    ]);
    expect(await screen.findByRole('heading',{name:'今日正确任务'})).toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'不可成为主任务'})).not.toBeInTheDocument();
  });
  it('运行中任务优先于未来任务',async()=>{
    renderTodayWithTasks([
      {...task,staff_assignment_id:'future',trip_title:'未来任务',journey_status:'pending',departs_at:new Date(atTokyoHour(1,9)).toISOString()},
      {...task,staff_assignment_id:'running',trip_title:'正在运行',journey_status:'in_progress',departs_at:new Date(atTokyoHour(-1,9)).toISOString()},
    ]);
    expect(await screen.findByRole('heading',{name:'正在运行'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'今日工作台'})).toBeInTheDocument();
    expect(screen.getByRole('region',{name:'今日概况'})).toHaveTextContent('当前登车');
  });
  it('多个运行中任务显示冲突，不静默隐藏',async()=>{
    renderTodayWithTasks([
      {...task,staff_assignment_id:'running-a',trip_title:'运行任务A',journey_status:'in_progress'},
      {...task,staff_assignment_id:'running-b',trip_title:'运行任务B',journey_status:'meeting'},
    ]);
    expect(await screen.findByRole('alert')).toHaveTextContent('2 个同时进行中的任务');
    expect(screen.getAllByText('运行任务A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('运行任务B').length).toBeGreaterThan(0);
  });
  it('读取失败只显示失败和重试，不伪装成无任务',async()=>{
    const client={auth:{getUser:async()=>({data:{user:{id:'staff-error',email:'error@example.invalid'}},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name:string)=>name==='get_staff_portal_tasks'?{data:null,error:{message:'offline'}}:{data:null,error:null}} as unknown as SupabaseClient;
    render(<MemoryRouter initialEntries={['/staff']}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Routes><Route path="/staff/*" element={<StaffPortal/>}/></Routes></AppProvider></MemoryRouter>);
    expect(await screen.findByText('任务读取失败')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'重新读取'})).toBeInTheDocument();
    expect(screen.queryByText('今天暂无已安排任务')).not.toBeInTheDocument();
  });
  it('待执行任务由真实 RPC 确认并重新读取',async()=>{
    const calls:string[]=[];
    const client={auth:{getUser:async()=>({data:{user:{id:'staff-ack'}},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name:string)=>{calls.push(name);if(name==='get_staff_portal_tasks')return {data:[{...task,departs_at:new Date(atTokyoHour(0,10)).toISOString(),journey_status:'pending',assignment_acknowledged:false}],error:null};if(name==='acknowledge_own_staff_assignment')return {data:new Date().toISOString(),error:null};return {data:null,error:null}}} as unknown as SupabaseClient;
    render(<MemoryRouter initialEntries={['/staff']}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Routes><Route path="/staff/*" element={<StaffPortal/>}/></Routes></AppProvider></MemoryRouter>);
    const button=await screen.findByRole('button',{name:'确认任务'});
    fireEvent.click(button);
    expect(await screen.findByText(/任务已确认/)).toBeInTheDocument();
    expect(calls).toContain('acknowledge_own_staff_assignment');
    expect(calls.filter(value=>value==='get_staff_portal_tasks').length).toBeGreaterThan(1);
  });
  it('只有历史任务时显示今日空状态且不冒充下一次出勤',async()=>{
    renderTodayWithTasks([{...task,trip_title:'历史完成',journey_status:'completed',departs_at:new Date(atTokyoHour(-1,9)).toISOString()}]);
    expect(await screen.findByText('今天暂无已安排任务')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('下一次出勤：');
  });
  it('只有未来任务时首页为空并显示下一次出勤',async()=>{
    renderTodayWithTasks([{...task,trip_title:'明日出勤',journey_status:'pending',departs_at:new Date(atTokyoHour(1,9)).toISOString()}]);
    expect(await screen.findByText('今天暂无已安排任务')).toBeInTheDocument();
    expect(screen.getByText(/下一次出勤：/)).toHaveTextContent('明日出勤');
  });
  it("只展示已进入本车的履约名单，不展示付款职责或支付凭据", async () => {
    const client = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
      },
      rpc: async (name: string) =>
        name === "get_staff_portal_tasks"
          ? { data: [task], error: null }
          : { data: null, error: null },
    } as unknown as SupabaseClient;
    render(
      <MemoryRouter>
        <AppProvider
          services={new ProductionBrowserServices(client, undefined)}
        >
          <StaffPortal />
        </AppProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("剩余未登车")).toBeInTheDocument();
    expect(screen.getByText("仅履约名单")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/¥|银行卡|卡号：|优惠券|付款资格|待人工确认|不可登车/);
    expect(screen.getByText("司机权限")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "乘客点名" })).toHaveAttribute(
      "href",
      "/staff/tasks/assignment-1/passengers",
    );
    expect(screen.getByRole("link", { name: "团队群聊" })).toHaveAttribute(
      "href",
      "/staff/tasks/assignment-1/chat",
    );
    expect(screen.getByRole("link", { name: "发送通知" })).toHaveAttribute(
      "href",
      "/staff/tasks/assignment-1/notice",
    );
    expect(screen.getByRole("link", { name: "集合管理" })).toHaveAttribute(
      "href",
      "/staff/tasks/assignment-1/meeting",
    );
    expect(screen.getByRole("link", { name: "异常上报" })).toHaveAttribute(
      "href",
      "/staff/tasks/assignment-1/incident",
    );
    expect(screen.getByRole("link", { name: "联系运营" })).toHaveAttribute(
      "href",
      "/staff/tasks/assignment-1/support",
    );
    expect(screen.getByRole("link", { name: "行程" })).toHaveAttribute(
      "href",
      "/staff/schedule",
    );
    expect(screen.getByRole("link", { name: "地图" })).toHaveAttribute(
      "href",
      "/staff/map",
    );
    expect(screen.getByRole("link", { name: "消息" })).toHaveAttribute(
      "href",
      "/staff/messages",
    );
    expect(screen.getByRole("link", { name: "我的" })).toHaveAttribute("href","/staff/profile");
  });
  it.each([
    ['/staff','今天暂无已安排任务','今日'],
    ['/staff/schedule','当前筛选没有行程','行程'],
    ['/staff/map','暂无可显示的任务地图','地图'],
    ['/staff/messages','暂无有权访问的行程群。','消息'],
    ['/staff/profile','我的推广','我的'],
  ])('无任务时 %s 仍提供独立页面、空状态和正确高亮',async(path,empty,activeLabel)=>{
    const client={auth:{getUser:async()=>({data:{user:{id:'staff-empty',email:'empty@example.invalid'}},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name:string)=>name==='get_staff_portal_tasks'?{data:[],error:null}:{data:null,error:null}} as unknown as SupabaseClient;
    render(<MemoryRouter initialEntries={[path]}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Routes><Route path="/staff/*" element={<StaffPortal/>}/></Routes></AppProvider></MemoryRouter>);
    expect(await screen.findByText(empty)).toBeInTheDocument();
    expect(screen.getByRole('link',{name:activeLabel})).toHaveClass('active');
    for(const [label,href] of [['今日','/staff'],['行程','/staff/schedule'],['地图','/staff/map'],['消息','/staff/messages'],['我的','/staff/profile']])expect(screen.getByRole('link',{name:label})).toHaveAttribute('href',href);
  });
  it('无任务时不显示假调度号码，有任务时进入可审计的调度请求',async()=>{
    const emptyClient={auth:{getUser:async()=>({data:{user:{id:'staff-contact'}},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name:string)=>name==='get_staff_portal_tasks'?{data:[],error:null}:{data:null,error:null}} as unknown as SupabaseClient;
    render(<MemoryRouter initialEntries={['/staff/messages?channel=dispatch']}><AppProvider services={new ProductionBrowserServices(emptyClient,undefined)}><Routes><Route path="/staff/*" element={<StaffPortal/>}/></Routes></AppProvider></MemoryRouter>);
    expect(await screen.findByText(/尚未配置通用调度电话或会话/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/0\d{1,4}-\d{2,4}-\d{3,4}/);
  });
  it.each([
    ['pending','待执行'],
    ['in_progress','进行中'],
    ['completed','已完成'],
  ])('行程页按服务端旅程状态显示 %s',async(journeyStatus,label)=>{
    const client={auth:{getUser:async()=>({data:{user:{id:'staff-state',email:'state@example.invalid'}},error:null}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async(name:string)=>name==='get_staff_portal_tasks'?{data:[{...task,journey_status:journeyStatus}],error:null}:{data:null,error:null}} as unknown as SupabaseClient;
    render(<MemoryRouter initialEntries={['/staff/schedule']}><AppProvider services={new ProductionBrowserServices(client,undefined)}><Routes><Route path="/staff/*" element={<StaffPortal/>}/></Routes></AppProvider></MemoryRouter>);
    expect(await screen.findByText(new RegExp(`· ${label}$`))).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'行程'})).toHaveAttribute('aria-current','page');
  });
  it("本车乘客点名仅显示最小必要字段并可保存状态", async () => {
    const calls: string[] = [];
    const client = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
      },
      rpc: async (name: string) => {
        calls.push(name);
        if (name === "get_staff_portal_tasks")
          return { data: [task], error: null };
        if (name === "get_vehicle_group_attendance")
          return {
            data: [
              {
                passenger_id: "passenger-1",
                passenger_label: "测试乘客",
                order_id: "order-123456",
                status: "pending",
                status_at: null,
                contact_status: null,
              },
            ],
            error: null,
          };
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient;
    render(
      <MemoryRouter initialEntries={["/staff/tasks/assignment-1/passengers"]}>
        <AppProvider
          services={new ProductionBrowserServices(client, undefined)}
        >
          <Routes>
            <Route
              path="/staff/tasks/:assignmentId/:action"
              element={<StaffTaskAction />}
            />
          </Routes>
        </AppProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("测试乘客")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@|卡号：|¥|银行卡号/);
    fireEvent.click(screen.getByRole("button", { name: "已登车" }));
    expect(await screen.findByText("乘客状态已保存。")).toBeInTheDocument();
    expect(calls).toContain("set_staff_passenger_checkin");
  });
  it("联系时间到达后按需显示可拨打电话并调用审计 RPC", async () => {
    const calls: string[] = [];
    const client = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
      },
      rpc: async (name: string) => {
        calls.push(name);
        if (name === "get_staff_portal_tasks")
          return { data: [task], error: null };
        if (name === "get_vehicle_group_attendance")
          return {
            data: [
              {
                passenger_id: "passenger-1",
                passenger_label: "测试乘客",
                order_id: "order-123456",
                status: "pending",
                status_at: null,
                contact_status: null,
              },
            ],
            error: null,
          };
        if (name === "get_staff_passenger_contact")
          return {
            data: [{ contact_name: "测试联系人", phone: "000-0000-0000" }],
            error: null,
          };
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient;
    render(
      <MemoryRouter initialEntries={["/staff/tasks/assignment-1/passengers"]}>
        <AppProvider
          services={new ProductionBrowserServices(client, undefined)}
        >
          <Routes>
            <Route
              path="/staff/tasks/:assignmentId/:action"
              element={<StaffTaskAction />}
            />
          </Routes>
        </AppProvider>
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "拨打乘客电话" }),
    );
    expect(
      await screen.findByRole("link", { name: "000-0000-0000" }),
    ).toHaveAttribute("href", "tel:000-0000-0000");
    expect(calls).toContain("get_staff_passenger_contact");
    expect(screen.getByRole("status")).toHaveTextContent("本次查看已记录");
    expect(screen.getByRole("link", { name: "地图" })).toHaveAttribute(
      "href",
      "/staff/map",
    );
  });
  it("异常上报写入审计队列并保留调度 API 边界", async () => {
    const client = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
      },
      rpc: async (name: string) =>
        name === "get_staff_portal_tasks"
          ? { data: [task], error: null }
          : { data: null, error: null },
    } as unknown as SupabaseClient;
    render(
      <MemoryRouter initialEntries={["/staff/tasks/assignment-1/incident"]}>
        <AppProvider
          services={new ProductionBrowserServices(client, undefined)}
        >
          <Routes>
            <Route
              path="/staff/tasks/:assignmentId/:action"
              element={<StaffTaskAction />}
            />
          </Routes>
        </AppProvider>
      </MemoryRouter>,
    );
    const input = await screen.findByPlaceholderText(/填写事实/);
    fireEvent.change(input, {
      target: { value: "测试车辆延误，不包含真实乘客资料" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交运营记录" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "已提交运营记录",
    );
    expect(screen.getByText(/Yuzu Dispatch/)).toBeInTheDocument();
  });
  it("司导可读取并提交版本化集合信息", async () => {
    const calls: string[] = [];
    const client = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe() {} } },
        }),
      },
      rpc: (name: string) => {
        calls.push(name);
        if (name === "get_staff_portal_tasks")
          return { data: [task], error: null };
        if (name === "get_current_vehicle_group_meeting")
          return { maybeSingle: async () => ({ data: null, error: null }) };
        if (name === "update_vehicle_group_meeting")
          return { data: 1, error: null };
        return { data: null, error: null };
      },
    } as unknown as SupabaseClient;
    render(
      <MemoryRouter initialEntries={["/staff/tasks/assignment-1/meeting"]}>
        <AppProvider
          services={new ProductionBrowserServices(client, undefined)}
        >
          <Routes>
            <Route
              path="/staff/tasks/:assignmentId/:action"
              element={<StaffTaskAction />}
            />
          </Routes>
        </AppProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/当前版本：尚未建立/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/集合时间/), {
      target: { value: "2026-09-04T11:30" },
    });
    fireEvent.change(screen.getByLabelText("集合地点名称"), {
      target: { value: "东大寺南大门东侧" },
    });
    fireEvent.change(screen.getByLabelText("详细地址"), {
      target: { value: "奈良市春日野町" },
    });
    fireEvent.change(screen.getByLabelText("纬度"), {
      target: { value: "34.6889" },
    });
    fireEvent.change(screen.getByLabelText("经度"), {
      target: { value: "135.8398" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存集合信息" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "集合信息已保存",
    );
    expect(calls).toContain("update_vehicle_group_meeting");
  });
});
