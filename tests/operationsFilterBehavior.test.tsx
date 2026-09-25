import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DepartureCenter } from "../src/app/operations/DepartureCenter";
import { RunCenter } from "../src/app/operations/RunCenter";
import { AppProvider } from "../src/app/store";
import type { ProductionBrowserServices } from "../src/shared/backend/productionServices";

afterEach(() => cleanup());

describe("运营筛选参数行为", () => {
  it("班次页把 URL 中的日本服务日期所在月份传给数据库查询", async () => {
    const listDepartureCalendar = vi.fn(async () => ({ data: [], error: null }));
    const services = {
      operations: {
        listProducts: vi.fn(async () => ({ data: [], error: null })),
        listDepartureCalendar,
      },
      loadSellableDepartures: async () => ({ data: [], error: null }),
      onAuthStateChange: () => () => {},
      currentUser: async () => null,
    } as unknown as ProductionBrowserServices;

    render(
      <MemoryRouter initialEntries={["/app/operations/departures?date=2026-09-11"]}>
        <AppProvider services={services}><DepartureCenter /></AppProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(listDepartureCalendar).toHaveBeenCalled());
    expect(listDepartureCalendar).toHaveBeenLastCalledWith("2026-09-01", "2026-09-30");
  });

  it("每日运行台使用 URL 日期加载班次和司导统计", async () => {
    const loadRunBoard = vi.fn(async () => ({ data: [], error: null }));
    const loadDriverStatistics = vi.fn(async () => ({ data: [], error: null }));
    const services = {
      operations: { loadRunBoard, loadDriverStatistics },
      loadSellableDepartures: async () => ({ data: [], error: null }),
      onAuthStateChange: () => () => {},
      currentUser: async () => null,
    } as unknown as ProductionBrowserServices;

    render(
      <MemoryRouter initialEntries={["/app/operations/run?date=2026-09-11"]}>
        <AppProvider services={services}><RunCenter /></AppProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(loadRunBoard).toHaveBeenCalledWith("2026-09-11"));
    expect(loadDriverStatistics).toHaveBeenCalledWith("2026-09-01", "2026-09-11");
  });

  it("班次参数打开真实运行详情而不是只高亮列表行", async () => {
    const loadRunBoard = vi.fn(async () => ({ data: [{
      departureId:"dep-11",tripTitle:"京都红叶一日游",departsAt:"2026-09-11T08:30:00+09:00",
      departureStatus:"published",vehicleGroupId:"vehicle-1",vehicleLabel:"大阪 500 あ 12-34",
      driverName:"测试司导",capacity:9,bookedSeats:6,arrived:5,boarded:4,journeyStatus:"boarding",
      currentStop:"京都站八条口",openIncidents:1,lastEventAt:"2026-09-11T08:20:00+09:00",
    },{
      departureId:"dep-11",tripTitle:"京都红叶一日游",departsAt:"2026-09-11T08:30:00+09:00",
      departureStatus:"published",vehicleGroupId:"vehicle-2",vehicleLabel:"大阪 501 い 56-78",
      driverName:"第二司导",capacity:8,bookedSeats:3,arrived:2,boarded:1,journeyStatus:"meeting",
      currentStop:null,openIncidents:0,lastEventAt:null,
    }], error: null }));
    const services = {
      operations: { loadRunBoard, loadDriverStatistics:vi.fn(async()=>({data:[],error:null})) },
      loadSellableDepartures: async () => ({ data: [], error: null }),
      onAuthStateChange: () => () => {}, currentUser: async () => null,
    } as unknown as ProductionBrowserServices;

    render(<MemoryRouter initialEntries={["/app/operations/run?date=2026-09-11&departure=dep-11"]}><AppProvider services={services}><RunCenter /></AppProvider></MemoryRouter>);

    expect(await screen.findByRole("heading",{name:"班次运行详情"})).toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"京都红叶一日游"})).toBeInTheDocument();
    expect(screen.getByText("9 / 17")).toBeInTheDocument();
    expect(screen.getByText("7 / 5")).toBeInTheDocument();
    expect(screen.getByText("大阪 500 あ 12-34")).toBeInTheDocument();
    expect(screen.getByText("大阪 501 い 56-78")).toBeInTheDocument();
    expect(screen.getByRole("link",{name:"编辑班次安排"})).toHaveAttribute("href","/app/operations/departures?date=2026-09-11&departure=dep-11");
    expect(screen.queryByText("本月司导运载统计")).not.toBeInTheDocument();
  });

  it("运营可从本车运行卡读取并保存版本化集合点", async () => {
    const loadStaffMeeting = vi.fn(async () => ({
      vehicle_group_id: "vehicle-1", meeting_at: "2026-09-11T02:30:00.000Z",
      meeting_name: "京都站八条口", meeting_address: "京都市南区东九条", latitude: 34.98,
      longitude: 135.76, landmark_description: "东侧出口", status: "scheduled", revision: 3,
      changed_reason: "原始确认", changed_at: "2026-09-10T00:00:00.000Z", acknowledged: false,
    }));
    const updateStaffMeeting = vi.fn(async () => 4);
    const services = {
      operations: {
        loadRunBoard: vi.fn(async () => ({ data: [{
          departureId:"dep-11",tripTitle:"京都红叶一日游",departsAt:"2026-09-11T08:30:00+09:00",
          departureStatus:"published",vehicleGroupId:"vehicle-1",vehicleLabel:"大阪 500 あ 12-34",
          driverName:"测试司导",capacity:9,bookedSeats:6,arrived:5,boarded:4,journeyStatus:"meeting",
          currentStop:null,openIncidents:0,lastEventAt:null,
        }], error: null })),
        loadDriverStatistics: vi.fn(async()=>({data:[],error:null})),
      },
      loadStaffMeeting,
      updateStaffMeeting,
      loadSellableDepartures: async () => ({ data: [], error: null }),
      onAuthStateChange: () => () => {}, currentUser: async () => null,
    } as unknown as ProductionBrowserServices;

    render(<MemoryRouter initialEntries={["/app/operations/run?date=2026-09-11&departure=dep-11"]}><AppProvider services={services}><RunCenter /></AppProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", {name:"编辑本车集合点"}));
    expect(await screen.findByRole("dialog")).toHaveTextContent("当前版本：3");
    fireEvent.change(screen.getByLabelText("本车集合变更原因"), {target:{value:"道路施工，改至东侧出口"}});
    fireEvent.click(screen.getByRole("button", {name:"保存本车集合点"}));
    await waitFor(() => expect(updateStaffMeeting).toHaveBeenCalledWith(expect.objectContaining({
      vehicleGroupId:"vehicle-1", reason:"道路施工，改至东侧出口", meetingName:"京都站八条口",
    })));
    expect((await screen.findAllByRole("status")).some((item) => item.textContent?.includes("已保存"))).toBe(true);
  });
});
