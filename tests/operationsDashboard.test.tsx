import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationsDashboard } from "../src/app/OperationsDashboard";
import { AppProvider } from "../src/app/store";
import type { ProductionBrowserServices } from "../src/shared/backend/productionServices";
import type {
  DispatchPlanDraft,
  OperationsSnapshot,
} from "../src/shared/integrations/supabaseOperations";

const snapshot: OperationsSnapshot = {
  bookingDrafts: [],
  fulfilmentWorkItems: [],
  notificationDeliveryIssues: [],
  vehicleTypes: [
    {
      type_key: "alphard-6",
      label: "Alphard（6客席）",
      sellable_capacity: 6,
      cost_units: 30,
      active: true,
    },
  ],
  vehicles: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      registration_identifier: "TEST-ALPHARD",
      vehicle_type_key: "alphard-6",
      external_dispatch_id: null,
      status: "available",
    },
  ],
  drivers: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      display_name: "虚构测试司机",
      external_dispatch_id: null,
      languages: ["zh-CN", "ja"],
      status: "available",
      driver_vehicle_qualifications: [{ vehicle_type_key: "alphard-6" }],
      driver_availability_windows: [
        { starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-03T00:00:00Z" },
      ],
    },
  ],
  departures: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      tripTitle: "测试京都奈良",
      departsAt: "2026-09-02T00:00:00Z",
      capacity: 6,
      status: "confirmed",
      meetingName: "大阪站",
      orderCount: 1,
      bookedSeats: 6,
      paidSeats: 6,
      pendingOrders: 0,
      grossAmountJpy: 60000,
      loadFactor: 100,
    },
  ],
  dispatchTasks: [],
  dispatchDrafts: 0,
  loadedAt: "2026-08-31T00:00:00Z",
};
afterEach(cleanup);

describe("运营派单界面", () => {
  it("从班次载入配车并保存完整草稿", async () => {
    const saveDispatchPlan = vi.fn(
      async (_departureId: string, _tasks: DispatchPlanDraft[]) => ({
        ok: true,
        error: null,
      }),
    );
    const operations = {
      loadSnapshot: vi.fn(async () => ({ data: snapshot, error: null })),
      saveDispatchPlan,
      createVehicle: vi.fn(),
      createDriver: vi.fn(),
      confirmDispatchTasks: vi.fn(),
      simulateDispatchSend: vi.fn(),
      cancelDispatchTasks: vi.fn(),
    };
    const services = {
      operations,
      loadSellableDepartures: async () => ({ data: [], error: null }),
      onAuthStateChange: () => () => {},
      currentUser: async () => null,
    } as unknown as ProductionBrowserServices;
    render(
      <AppProvider services={services}>
        <OperationsDashboard />
      </AppProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "载入配车规划" }),
    );
    const save = screen.getByRole("button", { name: "保存待审核派单草稿" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(saveDispatchPlan).toHaveBeenCalledTimes(1));
    expect(saveDispatchPlan.mock.calls[0][0]).toBe(snapshot.departures[0].id);
    expect(saveDispatchPlan.mock.calls[0][1][0]).toMatchObject({
      sequence: 1,
      vehicleType: "alphard-6",
      capacity: 6,
      passengerCount: 6,
      driverId: snapshot.drivers[0].id,
      fleetVehicleId: snapshot.vehicles[0].id,
    });
    expect(
      await screen.findByText("待审核派单草稿已保存，尚未通知司机"),
    ).toBeInTheDocument();
  });
  it("异步保存车辆后安全重置表单并刷新快照", async () => {
    const createVehicle = vi.fn(async () => true);
    const operations = {
      loadSnapshot: vi.fn(async () => ({ data: snapshot, error: null })),
      saveDispatchPlan: vi.fn(),
      createVehicle,
      createDriver: vi.fn(),
      confirmDispatchTasks: vi.fn(),
      simulateDispatchSend: vi.fn(),
      cancelDispatchTasks: vi.fn(),
    };
    const services = {
      operations,
      loadSellableDepartures: async () => ({ data: [], error: null }),
      onAuthStateChange: () => () => {},
      currentUser: async () => null,
    } as unknown as ProductionBrowserServices;
    render(
      <AppProvider services={services}>
        <OperationsDashboard />
      </AppProvider>,
    );
    const registration = await screen.findByRole("textbox", {
      name: "车牌／内部识别号",
    });
    fireEvent.change(registration, { target: { value: "TEST-ASYNC" } });
    fireEvent.change(screen.getByRole("combobox", { name: "车型" }), {
      target: { value: "alphard-6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存车辆" }));
    await waitFor(() => expect(createVehicle).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(registration).toHaveValue(""));
    expect(screen.getByText("车辆已保存")).toBeInTheDocument();
  });
  it("只对失败通知提供带原因的人工重试",async()=>{
    const retryNotificationDelivery=vi.fn(async()=>({ok:true,error:null}));vi.spyOn(window,'prompt').mockReturnValue('已核对渠道后重试');
    const issueSnapshot={...snapshot,notificationDeliveryIssues:[{id:'40000000-0000-4000-8000-000000000001',eventType:'meeting-updated',orderId:null,status:'failed' as const,attempts:5,lastErrorCode:'provider-delivery-failed',createdAt:'2026-09-03T00:00:00Z',updatedAt:'2026-09-03T00:05:00Z'},{id:'40000000-0000-4000-8000-000000000002',eventType:'departure-reminder',orderId:null,status:'submitted' as const,attempts:1,lastErrorCode:null,createdAt:'2026-09-03T00:00:00Z',updatedAt:'2026-09-03T00:05:00Z'}]};
    const services={operations:{loadSnapshot:vi.fn(async()=>({data:issueSnapshot,error:null})),retryNotificationDelivery,saveDispatchPlan:vi.fn(),createVehicle:vi.fn(),createDriver:vi.fn(),confirmDispatchTasks:vi.fn(),simulateDispatchSend:vi.fn(),cancelDispatchTasks:vi.fn()},loadSellableDepartures:async()=>({data:[],error:null}),onAuthStateChange:()=>()=>{},currentUser:async()=>null} as unknown as ProductionBrowserServices;
    render(<AppProvider services={services}><OperationsDashboard/></AppProvider>);fireEvent.click(await screen.findByRole('button',{name:'核对后重新发送'}));await waitFor(()=>expect(retryNotificationDelivery).toHaveBeenCalledWith('40000000-0000-4000-8000-000000000001','已核对渠道后重试'));expect(screen.getByText('已提交但回执超时')).toBeInTheDocument();expect(screen.getAllByRole('button',{name:'核对后重新发送'})).toHaveLength(1);
  });
});
